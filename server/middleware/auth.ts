import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'HOST' | 'PARTICIPANT';
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/**
 * Hono middleware that extracts and verifies the Bearer token.
 * Sets `userId`, `email`, and `role` on the context variables.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ message: 'Missing or invalid authorization header' }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    c.set('userId', payload.userId);
    c.set('email', payload.email);
    c.set('role', payload.role);
    await next();
  } catch {
    return c.json({ message: 'Invalid or expired token' }, 401);
  }
}

/**
 * Middleware that requires the HOST role.
 */
export async function hostOnly(c: Context, next: Next) {
  if (c.get('role') !== 'HOST') {
    return c.json({ message: 'Host access required' }, 403);
  }
  await next();
}
