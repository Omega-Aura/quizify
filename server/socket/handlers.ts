import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import { calculateScore } from '../lib/scoring';
import { verifyToken } from '../middleware/auth';

interface QuestionTimer {
  questionId: string;
  timeLimitMs: number;
  startedAt: number; // Date.now()
  timeout: NodeJS.Timeout;
}

// In-memory state per session
const sessionTimers = new Map<string, QuestionTimer>();
const playerSockets = new Map<string, string>(); // socketId → playerId

export function setupSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ─── Player joins a session ────────────────────────────────────
    socket.on('player:join', async (data: { pin: string; nickname: string; token?: string }) => {
      try {
        const { pin, nickname, token } = data;

        const session = await prisma.session.findUnique({
          where: { pin },
          include: { players: { select: { id: true, nickname: true } } },
        });

        if (!session || session.status === 'FINISHED') {
          socket.emit('error', { message: 'Session not found or has ended' });
          return;
        }

        // Optionally link to user account
        let userId: string | undefined;
        if (token) {
          try {
            const payload = verifyToken(token);
            userId = payload.userId;
          } catch { /* anonymous join is fine */ }
        }

        // Check for existing player (reconnect scenario)
        let player = await prisma.player.findFirst({
          where: { sessionId: session.id, nickname },
        });

        if (!player) {
          if (session.status !== 'LOBBY') {
            socket.emit('error', { message: 'Game has already started' });
            return;
          }
          player = await prisma.player.create({
            data: { sessionId: session.id, nickname, userId },
          });
        }

        // Map socket to player
        playerSockets.set(socket.id, player.id);

        // Join the socket.io room
        socket.join(`session:${session.id}`);
        socket.data.sessionId = session.id;
        socket.data.playerId = player.id;

        // Send join confirmation
        socket.emit('player:joined', {
          playerId: player.id,
          sessionId: session.id,
          nickname: player.nickname,
          totalScore: player.totalScore,
        });

        // Broadcast updated player list
        const players = await prisma.player.findMany({
          where: { sessionId: session.id },
          select: { id: true, nickname: true, totalScore: true },
          orderBy: { joinedAt: 'asc' },
        });

        io.to(`session:${session.id}`).emit('lobby:update', { players });

        // If game already active (reconnect), send current state
        if (session.status === 'ACTIVE' || session.status === 'REVEALING') {
          const questions = await prisma.question.findMany({
            where: { quizId: session.quizId },
            orderBy: { order: 'asc' },
            include: { answers: { orderBy: { index: 'asc' } } },
          });
          const currentQ = questions[session.currentQuestionIndex];
          if (currentQ) {
            const timer = sessionTimers.get(session.id);
            socket.emit('question:show', {
              index: session.currentQuestionIndex,
              prompt: currentQ.prompt,
              media: currentQ.mediaUrl,
              answers: currentQ.answers.map((a) => ({ index: a.index, text: a.text })),
              timeLimit: currentQ.timeLimit,
              serverStartTs: timer?.startedAt ?? Date.now(),
              totalQuestions: questions.length,
            });
          }
        }
      } catch (err) {
        console.error('player:join error:', err);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // ─── Host joins a session ──────────────────────────────────────
    socket.on('host:join', async (data: { sessionId: string; token: string }) => {
      try {
        const { sessionId, token } = data;
        const payload = verifyToken(token);

        const session = await prisma.session.findUnique({
          where: { id: sessionId },
          include: {
            quiz: { select: { hostId: true } },
            players: { select: { id: true, nickname: true, totalScore: true }, orderBy: { joinedAt: 'asc' } },
          },
        });

        if (!session || session.quiz.hostId !== payload.userId) {
          socket.emit('error', { message: 'Session not found or unauthorized' });
          return;
        }

        socket.join(`session:${sessionId}`);
        socket.join(`host:${sessionId}`);
        socket.data.sessionId = sessionId;
        socket.data.isHost = true;

        socket.emit('host:joined', {
          sessionId: session.id,
          pin: session.pin,
          status: session.status,
          players: session.players,
        });
      } catch (err) {
        console.error('host:join error:', err);
        socket.emit('error', { message: 'Failed to join as host' });
      }
    });

    // ─── Host starts the game ──────────────────────────────────────
    socket.on('host:start', async () => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId || !socket.data.isHost) return;

        const session = await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: 'ACTIVE',
            startedAt: new Date(),
            currentQuestionIndex: 0,
          },
        });

        const questions = await prisma.question.findMany({
          where: { quizId: session.quizId },
          orderBy: { order: 'asc' },
          include: { answers: { orderBy: { index: 'asc' } } },
        });

        if (questions.length === 0) {
          socket.emit('error', { message: 'No questions in quiz' });
          return;
        }

        const currentQ = questions[0];
        sendQuestion(io, sessionId, currentQ, 0, questions.length);
      } catch (err) {
        console.error('host:start error:', err);
      }
    });

    // ─── Player submits an answer ──────────────────────────────────
    socket.on('player:answer', async (data: { answerIndex: number }) => {
      try {
        const sessionId = socket.data.sessionId;
        const playerId = socket.data.playerId;
        if (!sessionId || !playerId) return;

        const timer = sessionTimers.get(sessionId);
        if (!timer) return;

        const now = Date.now();
        const responseMs = now - timer.startedAt;

        // Check deadline
        if (responseMs > timer.timeLimitMs + 1000) { // 1s grace period
          socket.emit('player:answer:late', { message: 'Too late!' });
          return;
        }

        // Check for duplicate submission
        const existing = await prisma.response.findUnique({
          where: { playerId_questionId: { playerId, questionId: timer.questionId } },
        });
        if (existing) {
          socket.emit('player:answer:duplicate', { message: 'Already answered' });
          return;
        }

        // Get question + correct answer
        const question = await prisma.question.findUnique({
          where: { id: timer.questionId },
          include: { answers: true },
        });
        if (!question) return;

        const correctAnswer = question.answers.find((a) => a.isCorrect);
        const isCorrect = correctAnswer?.index === data.answerIndex;

        const points = calculateScore(
          Math.min(responseMs, timer.timeLimitMs),
          timer.timeLimitMs,
          question.pointsMode,
          isCorrect
        );

        // Save response
        await prisma.response.create({
          data: {
            playerId,
            questionId: timer.questionId,
            answerIndex: data.answerIndex,
            responseMs: Math.round(responseMs),
            pointsAwarded: points,
          },
        });

        // Update player total score
        if (points > 0) {
          await prisma.player.update({
            where: { id: playerId },
            data: { totalScore: { increment: points } },
          });
        }

        // Confirm answer received
        socket.emit('player:answer:received', { answerIndex: data.answerIndex });

        // Broadcast answer count to host — scope to this session's players,
        // since the same quiz (and question) can be run in many sessions
        const responseCount = await prisma.response.count({
          where: { questionId: timer.questionId, player: { sessionId } },
        });
        const playerCount = await prisma.player.count({
          where: { sessionId },
        });

        io.to(`host:${sessionId}`).emit('answer:count', {
          answered: responseCount,
          total: playerCount,
        });
      } catch (err) {
        console.error('player:answer error:', err);
      }
    });

    // ─── Host reveals the answer ───────────────────────────────────
    socket.on('host:reveal', async () => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId || !socket.data.isHost) return;

        // Clear timer
        const timer = sessionTimers.get(sessionId);
        if (timer) {
          clearTimeout(timer.timeout);
        }

        await prisma.session.update({
          where: { id: sessionId },
          data: { status: 'REVEALING' },
        });

        const question = timer
          ? await prisma.question.findUnique({
              where: { id: timer.questionId },
              include: { answers: { orderBy: { index: 'asc' } } },
            })
          : null;

        if (!question) return;

        const correctIndices = question.answers
          .filter((a) => a.isCorrect)
          .map((a) => a.index);

        // Get answer distribution — scoped to this session's players only
        const responses = await prisma.response.findMany({
          where: { questionId: question.id, player: { sessionId } },
        });

        const answerCounts: Record<number, number> = {};
        question.answers.forEach((a) => { answerCounts[a.index] = 0; });
        responses.forEach((r) => {
          answerCounts[r.answerIndex] = (answerCounts[r.answerIndex] || 0) + 1;
        });

        // Send result to all players
        const players = await prisma.player.findMany({
          where: { sessionId },
          include: {
            responses: {
              where: { questionId: question.id },
            },
          },
        });

        // Send personalized results to each player
        for (const player of players) {
          const playerResponse = player.responses[0];
          const sockets = await io.in(`session:${sessionId}`).fetchSockets();
          const playerSocket = sockets.find((s) => s.data.playerId === player.id);

          if (playerSocket) {
            playerSocket.emit('question:result', {
              correctIndices,
              answerCounts,
              yourAnswer: playerResponse?.answerIndex ?? -1,
              yourPoints: playerResponse?.pointsAwarded ?? 0,
              isCorrect: playerResponse
                ? correctIndices.includes(playerResponse.answerIndex)
                : false,
            });
          }
        }

        // Send answer distribution to host
        io.to(`host:${sessionId}`).emit('question:result', {
          correctIndices,
          answerCounts,
          totalResponses: responses.length,
        });

        // Send leaderboard
        const leaderboard = await prisma.player.findMany({
          where: { sessionId },
          orderBy: { totalScore: 'desc' },
          take: 10,
          select: { id: true, nickname: true, totalScore: true },
        });

        const allPlayers = await prisma.player.findMany({
          where: { sessionId },
          orderBy: { totalScore: 'desc' },
          select: { id: true },
        });

        // Send personalized rank to each player
        for (const player of players) {
          const rank = allPlayers.findIndex((p) => p.id === player.id) + 1;
          const sockets = await io.in(`session:${sessionId}`).fetchSockets();
          const playerSocket = sockets.find((s) => s.data.playerId === player.id);

          if (playerSocket) {
            playerSocket.emit('leaderboard:update', {
              top10: leaderboard,
              yourRank: rank,
              yourScore: player.totalScore + (player.responses[0]?.pointsAwarded ?? 0),
            });
          }
        }

        // Send leaderboard to host
        io.to(`host:${sessionId}`).emit('leaderboard:update', {
          top10: leaderboard,
          totalPlayers: allPlayers.length,
        });
      } catch (err) {
        console.error('host:reveal error:', err);
      }
    });

    // ─── Host moves to next question ───────────────────────────────
    socket.on('host:next', async () => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId || !socket.data.isHost) return;

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
          },
        });

        if (!session) return;

        const nextIndex = session.currentQuestionIndex + 1;
        const questions = session.quiz.questions;

        if (nextIndex >= questions.length) {
          // End the session
          await endSession(io, sessionId);
          return;
        }

        await prisma.session.update({
          where: { id: sessionId },
          data: { currentQuestionIndex: nextIndex, status: 'ACTIVE' },
        });

        const nextQ = questions[nextIndex];
        sendQuestion(io, sessionId, nextQ, nextIndex, questions.length);
      } catch (err) {
        console.error('host:next error:', err);
      }
    });

    // ─── Host skips a question ─────────────────────────────────────
    socket.on('host:skip', async () => {
      // Same as host:next
      socket.emit('host:next');
    });

    // ─── Host ends the session ─────────────────────────────────────
    socket.on('host:end', async () => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId || !socket.data.isHost) return;
        await endSession(io, sessionId);
      } catch (err) {
        console.error('host:end error:', err);
      }
    });

    // ─── Disconnect ────────────────────────────────────────────────
    socket.on('disconnect', () => {
      playerSockets.delete(socket.id);
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────

interface QuestionData {
  id: string;
  prompt: string;
  mediaUrl: string | null;
  timeLimit: number;
  answers: { index: number; text: string }[];
}

function sendQuestion(
  io: Server,
  sessionId: string,
  question: QuestionData & { answers: Array<{ index: number; text: string; imageUrl: string | null; isCorrect: boolean }> },
  index: number,
  totalQuestions: number
) {
  const timeLimitMs = question.timeLimit * 1000;
  const startedAt = Date.now();

  // Clear previous timer
  const prev = sessionTimers.get(sessionId);
  if (prev) clearTimeout(prev.timeout);

  // Set auto-reveal timeout
  const timeout = setTimeout(() => {
    // Auto-broadcast that time is up (host can still manually reveal)
    io.to(`session:${sessionId}`).emit('question:timeup', { index });
  }, timeLimitMs + 500);

  sessionTimers.set(sessionId, {
    questionId: question.id,
    timeLimitMs,
    startedAt,
    timeout,
  });

  // Update session with question start time
  prisma.session.update({
    where: { id: sessionId },
    data: { questionStartedAt: new Date(startedAt) },
  }).catch(console.error);

  // Broadcast to everyone in the session (answers without isCorrect)
  io.to(`session:${sessionId}`).emit('question:show', {
    index,
    prompt: question.prompt,
    media: question.mediaUrl,
    answers: question.answers.map((a) => ({ index: a.index, text: a.text })),
    timeLimit: question.timeLimit,
    serverStartTs: startedAt,
    totalQuestions,
  });
}

async function endSession(io: Server, sessionId: string) {
  const timer = sessionTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer.timeout);
    sessionTimers.delete(sessionId);
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'FINISHED', endedAt: new Date() },
  });

  const leaderboard = await prisma.player.findMany({
    where: { sessionId },
    orderBy: { totalScore: 'desc' },
    select: { id: true, nickname: true, totalScore: true },
  });

  io.to(`session:${sessionId}`).emit('session:final', {
    sessionId,
    leaderboard,
  });
}
