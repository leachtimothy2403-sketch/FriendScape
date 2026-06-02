import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;   // parent user JWT
  childId?: string;  // child session JWT
}

// Parses JWT if present but never rejects — allows public routes to see child context.
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string; childId?: string };
      req.userId  = payload.userId;
      req.childId = payload.childId;
    } catch { /* ignore invalid/expired tokens */ }
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId?: string;
      childId?: string;
    };
    req.userId  = payload.userId;
    req.childId = payload.childId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
