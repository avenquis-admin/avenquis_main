import { Router } from "express";
import { login, logout, me, changePassword, changeInitialPassword, requestPasswordReset, resetPassword, activateAccount } from "./auth.controller";
import { requireAuth, requireSession } from "../../middlewares/authMiddleware";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireSession, me);
router.post("/change-initial-password", requireSession, changeInitialPassword);
router.post("/change-password", requireAuth, changePassword);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.post("/activate", activateAccount);

export default router;
