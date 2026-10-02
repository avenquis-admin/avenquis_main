import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      meta: { correlationId: req.id },
    });
  }

  if (err instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: err.format(),
      },
      meta: { correlationId: req.id },
    });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
    meta: { correlationId: req.id },
  });
};
