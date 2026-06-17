import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-tests';

export function makeChildToken(childId: string): string {
  return jwt.sign({ childId }, SECRET, { expiresIn: '1h' });
}

export function makeParentToken(userId: string): string {
  return jwt.sign({ userId, type: 'parent' }, SECRET, { expiresIn: '1h' });
}
