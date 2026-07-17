import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, hostOnly } from '../middleware/auth';

export const quizRoutes = new Hono();

// All quiz routes require auth
quizRoutes.use('*', authMiddleware);

// ─── Validation ──────────────────────────────────────────────────────

const answerSchema = z.object({
  index: z.number().min(0).max(3),
  text: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  isCorrect: z.boolean(),
});

const questionSchema = z.object({
  order: z.number().min(0),
  prompt: z.string().min(1),
  mediaUrl: z.string().nullable().optional(),
  type: z.enum(['QUIZ', 'TRUE_FALSE']).default('QUIZ'),
  timeLimit: z.number().min(5).max(90).default(20),
  pointsMode: z.enum(['STANDARD', 'DOUBLE', 'NONE']).default('STANDARD'),
  singleSelect: z.boolean().default(true),
  answers: z.array(answerSchema).min(2).max(4),
});

const quizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
  coverImage: z.string().nullable().optional(),
  questions: z.array(questionSchema).min(1),
});

// ─── GET / — list host's quizzes ─────────────────────────────────────

quizRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const quizzes = await prisma.quiz.findMany({
    where: { hostId: userId },
    include: {
      _count: { select: { questions: true, sessions: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return c.json({ quizzes });
});

// ─── GET /:id — single quiz with questions & answers ─────────────────

quizRoutes.get('/:id', async (c) => {
  const quizId = c.req.param('id');
  const userId = c.get('userId');

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, hostId: userId },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { answers: { orderBy: { index: 'asc' } } },
      },
    },
  });

  if (!quiz) {
    return c.json({ message: 'Quiz not found' }, 404);
  }

  return c.json({ quiz });
});

// ─── POST / — create quiz ────────────────────────────────────────────

quizRoutes.post('/', hostOnly, async (c) => {
  const body = await c.req.json();
  const result = quizSchema.safeParse(body);

  if (!result.success) {
    return c.json({ message: result.error.issues[0].message, errors: result.error.issues }, 400);
  }

  const { title, description, coverImage, questions } = result.data;
  const userId = c.get('userId');

  const quiz = await prisma.quiz.create({
    data: {
      hostId: userId,
      title,
      description: description ?? null,
      coverImage: coverImage ?? null,
      questions: {
        create: questions.map((q) => ({
          order: q.order,
          prompt: q.prompt,
          mediaUrl: q.mediaUrl ?? null,
          type: q.type,
          timeLimit: q.timeLimit,
          pointsMode: q.pointsMode,
          singleSelect: q.singleSelect,
          answers: {
            create: q.answers.map((a) => ({
              index: a.index,
              text: a.text,
              imageUrl: a.imageUrl ?? null,
              isCorrect: a.isCorrect,
            })),
          },
        })),
      },
    },
    include: {
      questions: {
        include: { answers: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  return c.json({ quiz }, 201);
});

// ─── PUT /:id — update quiz (replace all questions) ──────────────────

quizRoutes.put('/:id', hostOnly, async (c) => {
  const quizId = c.req.param('id');
  const userId = c.get('userId');
  const body = await c.req.json();
  const result = quizSchema.safeParse(body);

  if (!result.success) {
    return c.json({ message: result.error.issues[0].message, errors: result.error.issues }, 400);
  }

  const existing = await prisma.quiz.findFirst({ where: { id: quizId, hostId: userId } });
  if (!existing) {
    return c.json({ message: 'Quiz not found' }, 404);
  }

  const { title, description, coverImage, questions } = result.data;

  // Delete old questions (cascade deletes answers + responses)
  await prisma.question.deleteMany({ where: { quizId } });

  const quiz = await prisma.quiz.update({
    where: { id: quizId },
    data: {
      title,
      description: description ?? null,
      coverImage: coverImage ?? null,
      questions: {
        create: questions.map((q) => ({
          order: q.order,
          prompt: q.prompt,
          mediaUrl: q.mediaUrl ?? null,
          type: q.type,
          timeLimit: q.timeLimit,
          pointsMode: q.pointsMode,
          singleSelect: q.singleSelect,
          answers: {
            create: q.answers.map((a) => ({
              index: a.index,
              text: a.text,
              imageUrl: a.imageUrl ?? null,
              isCorrect: a.isCorrect,
            })),
          },
        })),
      },
    },
    include: {
      questions: {
        include: { answers: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  return c.json({ quiz });
});

// ─── POST /:id/duplicate — duplicate a quiz ──────────────────────────

quizRoutes.post('/:id/duplicate', hostOnly, async (c) => {
  const quizId = c.req.param('id');
  const userId = c.get('userId');

  const original = await prisma.quiz.findFirst({
    where: { id: quizId, hostId: userId },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { answers: { orderBy: { index: 'asc' } } },
      },
    },
  });

  if (!original) {
    return c.json({ message: 'Quiz not found' }, 404);
  }

  const copy = await prisma.quiz.create({
    data: {
      hostId: userId,
      title: `${original.title} (Copy)`,
      description: original.description,
      coverImage: original.coverImage,
      questions: {
        create: original.questions.map((q) => ({
          order: q.order,
          prompt: q.prompt,
          mediaUrl: q.mediaUrl,
          type: q.type,
          timeLimit: q.timeLimit,
          pointsMode: q.pointsMode,
          singleSelect: q.singleSelect,
          answers: {
            create: q.answers.map((a) => ({
              index: a.index,
              text: a.text,
              imageUrl: a.imageUrl,
              isCorrect: a.isCorrect,
            })),
          },
        })),
      },
    },
    include: {
      questions: { include: { answers: true }, orderBy: { order: 'asc' } },
    },
  });

  return c.json({ quiz: copy }, 201);
});

// ─── DELETE /:id ─────────────────────────────────────────────────────

quizRoutes.delete('/:id', hostOnly, async (c) => {
  const quizId = c.req.param('id');
  const userId = c.get('userId');

  const existing = await prisma.quiz.findFirst({ where: { id: quizId, hostId: userId } });
  if (!existing) {
    return c.json({ message: 'Quiz not found' }, 404);
  }

  await prisma.quiz.delete({ where: { id: quizId } });
  return c.json({ message: 'Quiz deleted' });
});
