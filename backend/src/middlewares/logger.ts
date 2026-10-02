import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.get("x-correlation-id");
  req.id = incoming && /^[A-Za-z0-9._:-]{8,200}$/.test(incoming) ? incoming : uuidv4();
  res.setHeader("X-Request-Id", req.id);
  res.setHeader("X-Correlation-Id", req.id);
  next();
};
