import { Router } from "express";
import { createAccessRequest } from "./public.controller";

const router = Router();

router.post("/access-requests", createAccessRequest);

export default router;
