import { Router } from "express";
import { provisioningCommandSchema } from "../../contracts/platform";
import { ApiError } from "../../middlewares/errorHandler";
import { requireControlService } from "../../middlewares/controlServiceAuth";
import { processProvisioningCommand } from "../../services/platformProvisioning";

const router = Router();

router.post("/provisioning", requireControlService, async (req, res, next) => {
  try {
    const command = provisioningCommandSchema.parse(req.body);
    const headerCorrelationId = req.get("x-correlation-id");
    if (headerCorrelationId && headerCorrelationId !== command.correlationId) {
      throw new ApiError(400, "CORRELATION_ID_MISMATCH", "Header and command correlation IDs must match.");
    }
    req.id = command.correlationId;
    res.setHeader("X-Correlation-Id", command.correlationId);
    const result = await processProvisioningCommand(command);
    res.status(200).json({ success: true, data: result, meta: { correlationId: command.correlationId } });
  } catch (error) {
    next(error);
  }
});

export default router;
