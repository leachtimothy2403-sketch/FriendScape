import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  console.error(`[${new Date().toISOString()}] ${status} — ${message}`, err.stack);
  res.status(status).json({ error: message });
}
