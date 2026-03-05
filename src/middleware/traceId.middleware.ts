import { AsyncLocalStorage } from "async_hooks";
import { v4 as uuidv4 } from "uuid";
import { Request, Response, NextFunction } from "express";

// The storage container
export const logStorage = new AsyncLocalStorage<Map<string, string>>();

export const traceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const store = new Map();
  // Check if a trace ID already exists (from a parent service) or create a new one
  const traceId = (req.headers["x-trace-id"] as string) || uuidv4();

  store.set("traceId", traceId);

  logStorage.run(store, () => {
    next();
  });
};
