import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { authMiddleware, hostOnly } from '../middleware/auth';
import { generatePin } from '../lib/scoring';

export const sessionRoutes = new Hono();

sessionRoutes.use('*', authMiddleware);

// ─── POST /create — create a live session for a quiz ─────────────────

sessionRoutes.post('/create', hostOnly, async (c) => {
  const { quizId } = await c.req.json();
  const userId = c.get('userId');

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, hostId: userId },
    include: { _count: { select: { questions: true } } },
  });

  if (!quiz) {
    return c.json({ message: 'Quiz not found' }, 404);
  }

  if (quiz._count.questions === 0) {
    return c.json({ message: 'Quiz has no questions' }, 400);
  }

  // Close any lingering unfinished sessions of this quiz (e.g. the host
  // closed the tab without ending the game). Otherwise their PINs stay
  // joinable forever and returning players see stale scores.
  await prisma.session.updateMany({
    where: { quizId, status: { not: 'FINISHED' } },
    data: { status: 'FINISHED', endedAt: new Date() },
  });

  // Generate unique PIN
  let pin: string;
  let attempts = 0;
  do {
    pin = generatePin();
    const existing = await prisma.session.findUnique({ where: { pin } });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    return c.json({ message: 'Failed to generate unique PIN' }, 500);
  }

  const session = await prisma.session.create({
    data: { quizId, pin },
  });

  return c.json({ session }, 201);
});

// ─── GET /pin/:pin — lookup session by PIN ───────────────────────────

sessionRoutes.get('/pin/:pin', async (c) => {
  const pin = c.req.param('pin');

  const session = await prisma.session.findUnique({
    where: { pin },
    include: {
      quiz: { select: { title: true, description: true } },
      _count: { select: { players: true } },
    },
  });

  if (!session) {
    return c.json({ message: 'Session not found' }, 404);
  }

  if (session.status === 'FINISHED') {
    return c.json({ message: 'This session has ended' }, 410);
  }

  return c.json({
    session: {
      id: session.id,
      pin: session.pin,
      status: session.status,
      quizTitle: session.quiz.title,
      quizDescription: session.quiz.description,
      playerCount: session._count.players,
    },
  });
});

// ─── GET /:id — get session details (host-owner only: includes correct answers) ──

sessionRoutes.get('/:id', hostOnly, async (c) => {
  const sessionId = c.req.param('id');

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { answers: { orderBy: { index: 'asc' } } },
          },
        },
      },
      players: {
        orderBy: { totalScore: 'desc' },
        select: { id: true, nickname: true, totalScore: true, joinedAt: true },
      },
    },
  });

  if (!session) {
    return c.json({ message: 'Session not found' }, 404);
  }
  if (session.quiz.hostId !== c.get('userId')) {
    return c.json({ message: 'Not your session' }, 403);
  }

  return c.json({ session });
});

// ─── GET /:id/results — full results with per-question breakdown ─────

sessionRoutes.get('/:id/results', hostOnly, async (c) => {
  const sessionId = c.req.param('id');

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        select: { title: true, hostId: true },
      },
      players: {
        orderBy: { totalScore: 'desc' },
        include: {
          responses: {
            include: {
              question: {
                select: {
                  prompt: true,
                  order: true,
                  answers: { orderBy: { index: 'asc' } },
                },
              },
            },
            orderBy: { question: { order: 'asc' } },
          },
        },
      },
    },
  });

  if (!session) {
    return c.json({ message: 'Session not found' }, 404);
  }
  if (session.quiz.hostId !== c.get('userId')) {
    return c.json({ message: 'Not your session' }, 403);
  }

  return c.json({ session });
});

// ─── GET /:id/results/csv — export results as CSV ────────────────────

sessionRoutes.get('/:id/results/csv', hostOnly, async (c) => {
  const sessionId = c.req.param('id');

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            select: { prompt: true, order: true },
          },
        },
      },
      players: {
        orderBy: { totalScore: 'desc' },
        include: {
          responses: {
            orderBy: { question: { order: 'asc' } },
            include: { question: { select: { order: true } } },
          },
        },
      },
    },
  });

  if (!session) {
    return c.json({ message: 'Session not found' }, 404);
  }
  if (session.quiz.hostId !== c.get('userId')) {
    return c.json({ message: 'Not your session' }, 403);
  }

  const questions = session.quiz.questions;
  const headerCols = [
    'Rank',
    'Nickname',
    'Total Score',
    ...questions.map((q) => `Q${q.order + 1}: ${q.prompt}`),
  ];

  const rows = session.players.map((player, idx) => {
    const responseCols = questions.map((q) => {
      const resp = player.responses.find((r) => r.question.order === q.order);
      return resp ? String(resp.pointsAwarded) : '0';
    });
    return [String(idx + 1), player.nickname, String(player.totalScore), ...responseCols];
  });

  const csvContent = [
    headerCols.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', `attachment; filename="quizify-results-${sessionId}.csv"`);
  return c.text(csvContent);
});

// ─── GET /:id/player/:playerId — individual player result ────────────

sessionRoutes.get('/:id/player/:playerId', async (c) => {
  const sessionId = c.req.param('id');
  const playerId = c.req.param('playerId');

  const player = await prisma.player.findFirst({
    where: { id: playerId, sessionId },
    include: {
      session: {
        include: {
          quiz: { select: { title: true } },
          players: {
            orderBy: { totalScore: 'desc' },
            select: { id: true, nickname: true, totalScore: true },
          },
        },
      },
      responses: {
        include: {
          question: {
            include: { answers: { orderBy: { index: 'asc' } } },
          },
        },
        orderBy: { question: { order: 'asc' } },
      },
    },
  });

  if (!player) {
    return c.json({ message: 'Player not found' }, 404);
  }

  // Compute rank
  const rank = player.session.players.findIndex((p) => p.id === playerId) + 1;

  return c.json({
    player: {
      id: player.id,
      nickname: player.nickname,
      totalScore: player.totalScore,
      rank,
      totalPlayers: player.session.players.length,
      quizTitle: player.session.quiz.title,
      responses: player.responses,
    },
  });
});
