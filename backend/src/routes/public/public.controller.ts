import { Request, Response, NextFunction } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { accessRequests } from "../../db/schema";
import { ApiError } from "../../middlewares/errorHandler";
import { writeAuditEvent } from "../../services/audit";

const baseFields = {
  requesterName: z.string().trim().min(1, "Full name is required").max(255),
  requesterEmail: z.string().trim().email("Invalid email address").max(320),
  mobile: z.string().trim().min(6, "Mobile number is required").max(50),
  professionalRegistration: z.string().trim().max(255).optional(),
  reasonUseCase: z.string().trim().min(5, "Reason / use case is required").max(2000),
};

const accessRequestSchema = z.discriminatedUnion("requestType", [
  z.object({
    requestType: z.literal("individual"),
    ...baseFields,
    professionalRole: z.string().trim().min(1, "Professional role / status is required").max(255),
    firmName: z.string().trim().max(255).optional(),
    principalName: z.string().trim().max(255).optional(),
    articleshipRegistrationDate: z.string().trim().max(20).optional(),
    articleshipPeriod: z.string().trim().max(100).optional(),
    currentCaLevel: z.string().trim().max(120).optional(),
    examProgressStatus: z.string().trim().max(500).optional(),
    accessReasons: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
    otherReason: z.string().trim().max(500).optional(),
    additionalNote: z.string().trim().max(2000).optional(),
  }),
  z.object({
    requestType: z.literal("firm"),
    ...baseFields,
    firmName: z.string().trim().min(1, "Firm name is required").max(255),
    partnerName: z.string().trim().min(1, "Partner / proprietor name is required").max(255),
    practiceType: z.string().trim().min(1, "Practice type is required").max(255),
    firmSize: z.string().trim().min(1, "Firm size is required").max(100),
  }),
]);

function requestAuditMetadata(req: Request) {
  return JSON.stringify({
    source: "public_web",
    ip: req.ip || null,
    userAgent: req.get("user-agent") || null,
    submittedAt: new Date().toISOString(),
  });
}

export const createAccessRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = accessRequestSchema.parse(req.body);
    const requesterEmail = validatedData.requesterEmail.toLowerCase();

    const [existingRequest] = await db
      .select({ id: accessRequests.id })
      .from(accessRequests)
      .where(and(
        eq(accessRequests.requesterEmail, requesterEmail),
        inArray(accessRequests.status, ["pending"]),
      ))
      .limit(1);

    if (existingRequest) {
      throw new ApiError(409, "ACCESS_REQUEST_EXISTS", "An access request for this email is already pending review.");
    }

    const auditMetadata = requestAuditMetadata(req);
    const newRequest = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(accessRequests)
        .values({
          requestType: validatedData.requestType,
          requesterName: validatedData.requesterName,
          requesterEmail,
          mobile: validatedData.mobile,
          professionalRole: validatedData.requestType === "individual" ? validatedData.professionalRole : null,
          professionalRegistration: validatedData.professionalRegistration || null,
          principalName: validatedData.requestType === "individual" ? validatedData.principalName || null : null,
          articleshipRegistrationDate: validatedData.requestType === "individual" ? validatedData.articleshipRegistrationDate || null : null,
          articleshipPeriod: validatedData.requestType === "individual" ? validatedData.articleshipPeriod || null : null,
          currentCaLevel: validatedData.requestType === "individual" ? validatedData.currentCaLevel || null : null,
          examProgressStatus: validatedData.requestType === "individual" ? validatedData.examProgressStatus || null : null,
          accessReasons: validatedData.requestType === "individual" && validatedData.accessReasons ? JSON.stringify(validatedData.accessReasons) : null,
          otherReason: validatedData.requestType === "individual" ? validatedData.otherReason || null : null,
          additionalNote: validatedData.requestType === "individual" ? validatedData.additionalNote || null : null,
          reasonUseCase: validatedData.reasonUseCase,
          firmName: validatedData.firmName || null,
          partnerName: validatedData.requestType === "firm" ? validatedData.partnerName : null,
          practiceType: validatedData.requestType === "firm" ? validatedData.practiceType : null,
          firmSize: validatedData.requestType === "firm" ? validatedData.firmSize : null,
          auditMetadata,
          status: "pending",
        })
        .returning({ id: accessRequests.id, status: accessRequests.status, submittedAt: accessRequests.submittedAt });

      await writeAuditEvent(tx, {
        actor: `public:${requesterEmail}`, actorUserId: `public:${requesterEmail}`, actorRoleContext: "PUBLIC_APPLICANT",
        action: "ACCESS_REQUEST_SUBMITTED", targetResourceType: "access_request", targetResourceId: created.id,
        previousState: "not_submitted", newState: "pending", correlationId: req.id,
        reason: "Public access request submitted", sourceApplication: "core",
        metadata: JSON.parse(auditMetadata),
      });

      return created;
    });

    res.status(201).json({
      success: true,
      data: {
        id: newRequest.id,
        status: newRequest.status,
        submittedAt: newRequest.submittedAt.toISOString(),
      },
      message: "Access request submitted and pending review.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ApiError(400, "VALIDATION_ERROR", error.issues[0]?.message || "Invalid access request"));
    } else {
      next(error);
    }
  }
};
