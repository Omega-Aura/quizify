import { Hono } from 'hono';
import { z } from 'zod';
import { hash, compare } from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken, authMiddleware } from '../middleware/auth';

export const authRoutes = new Hono();

// ─── Validation ──────────────────────────────────────────────────────

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required').max(50),
  role: z.enum(['HOST', 'PARTICIPANT']).default('PARTICIPANT'),
  hostKey: z.string().optional(),
});

// Secret required to sign up as a HOST. Must be set via the HOST_SIGNUP_KEY
// environment variable — if it is unset, host signup is disabled (fail closed).
const HOST_SIGNUP_KEY = process.env.HOST_SIGNUP_KEY;

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ─── POST /signup ────────────────────────────────────────────────────

authRoutes.post('/signup', async (c) => {
  const body = await c.req.json();
  const result = signupSchema.safeParse(body);

  if (!result.success) {
    return c.json({ message: result.error.issues[0].message }, 400);
  }

  const { email, password, name, role, hostKey } = result.data;

  if (role === 'HOST') {
    if (!HOST_SIGNUP_KEY) {
      return c.json({ message: 'Host signup is not enabled' }, 403);
    }
    if (hostKey !== HOST_SIGNUP_KEY) {
      return c.json({ message: 'Invalid host key' }, 403);
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return c.json({ message: 'Email already registered' }, 409);
  }

  const passwordHash = await hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role },
  });

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  }, 201);
});

// ─── POST /login ─────────────────────────────────────────────────────

authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  const result = loginSchema.safeParse(body);

  if (!result.success) {
    return c.json({ message: result.error.issues[0].message }, 400);
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return c.json({ message: 'Invalid email or password' }, 401);
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ message: 'Invalid email or password' }, 401);
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// ─── GET /me ─────────────────────────────────────────────────────────

authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    return c.json({ message: 'User not found' }, 404);
  }

  return c.json({ user });
});
