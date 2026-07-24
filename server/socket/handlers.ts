import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import { calculateScore } from '../lib/scoring';
import { verifyToken } from '../middleware/auth';
import {
  LiveSession,
  getSession,
  getOrLoadSessionById,
  getOrLoadSessionByPin,
  deleteSession,
  addPlayer,
  attachSocket,
  detachSocket,
  recordAnswer,
  startQuestion,
  clearQuestionTimeout,
  getLobbyPlayers,
  getLeaderboard,
  flushSession,
  waitForCleanFlush,
} from '../lib/sessionStore';

// Gameplay state lives in server/lib/sessionStore.ts (memory-authoritative,
// batch-flushed to Postgres). Handlers here are a thin event layer.

const LOBBY_BROADCAST_THROTTLE_MS = 300;

export function setupSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ─── Clock sync ───────────────────────────────────────────────
    // Countdown timers (question:show's serverStartTs) are compared against
    // each client's own Date.now(), so any device with a skewed system clock
    // would otherwise show a different remaining time than everyone else.
    // Round-trip echo lets each client estimate its offset from server time.
    socket.on('time:sync', (clientSentAt: number) => {
      socket.emit('time:sync:response', { clientSentAt, serverTime: Date.now() });
    });

    // ─── Player joins a session ────────────────────────────────────
    socket.on('player:join', async (data: { pin: string; nickname: string; token?: string }) => {
      try {
        const { pin, nickname, token } = data;

        const ls = await getOrLoadSessionByPin(pin);
        if (!ls) {
          socket.emit('error', { message: 'Session not found or has ended' });
          return;
        }
        resumeTimerIfNeeded(io, ls);

        // Optionally link to user account
        let userId: string | undefined;
        if (token) {
          try {
            userId = verifyToken(token).userId;
          } catch { /* anonymous join is fine */ }
        }

        // Reconnect scenario: nickname already known to this session
        const existingId = ls.playersByNickname.get(nickname);
        let player = existingId ? ls.players.get(existingId) : undefined;

        if (!player) {
          if (ls.status !== 'LOBBY') {
            socket.emit('error', { message: 'Game has already started' });
            return;
          }
          // Kept synchronous: player:joined needs a stable id, and the row
          // must exist before any Response flush references it.
          try {
            const row = await prisma.player.create({
              data: { sessionId: ls.id, nickname, userId },
            });
            player = addPlayer(ls, row);
          } catch (err) {
            // Two sockets racing the same nickname — treat loser as reconnect
            if ((err as { code?: string }).code === 'P2002') {
              const row = await prisma.player.findFirst({
                where: { sessionId: ls.id, nickname },
              });
              if (!row) throw err;
              player = ls.players.get(row.id) ?? addPlayer(ls, row);
            } else {
              throw err;
            }
          }
        }

        attachSocket(ls, player.id, socket.id);
        socket.join(`session:${ls.id}`);
        socket.data.sessionId = ls.id;
        socket.data.playerId = player.id;

        // Send join confirmation
        socket.emit('player:joined', {
          playerId: player.id,
          sessionId: ls.id,
          nickname: player.nickname,
          totalScore: player.totalScore,
        });

        broadcastLobby(io, ls);

        // If game already active (reconnect), send current state from cache
        if (ls.status === 'ACTIVE' || ls.status === 'REVEALING') {
          const currentQ = ls.questions[ls.currentQuestionIndex];
          if (currentQ) {
            socket.emit('question:show', {
              index: ls.currentQuestionIndex,
              prompt: currentQ.prompt,
              media: currentQ.mediaUrl,
              answers: currentQ.answers.map((a) => ({ index: a.index, text: a.text })),
              timeLimit: currentQ.timeLimit,
              serverStartTs: ls.timer?.startedAt ?? Date.now(),
              totalQuestions: ls.questions.length,
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

        const ls = await getOrLoadSessionById(sessionId);
        if (!ls || ls.hostId !== payload.userId) {
          socket.emit('error', { message: 'Session not found or unauthorized' });
          return;
        }
        resumeTimerIfNeeded(io, ls);

        socket.join(`session:${sessionId}`);
        socket.join(`host:${sessionId}`);
        socket.data.sessionId = sessionId;
        socket.data.isHost = true;

        socket.emit('host:joined', {
          sessionId: ls.id,
          pin: ls.pin,
          status: ls.status,
          players: getLobbyPlayers(ls),
        });

        // Host page reload mid-game: restore the question view + answer count
        if (ls.status === 'ACTIVE' || ls.status === 'REVEALING') {
          const currentQ = ls.questions[ls.currentQuestionIndex];
          if (currentQ) {
            socket.emit('question:show', {
              index: ls.currentQuestionIndex,
              prompt: currentQ.prompt,
              media: currentQ.mediaUrl,
              answers: currentQ.answers.map((a) => ({ index: a.index, text: a.text })),
              timeLimit: currentQ.timeLimit,
              serverStartTs: ls.timer?.startedAt ?? Date.now(),
              totalQuestions: ls.questions.length,
            });
            socket.emit('answer:count', {
              answered: ls.answered.size,
              total: ls.players.size,
            });
          }
        }
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

        const ls = await getOrLoadSessionById(sessionId);
        if (!ls) return;

        if (ls.questions.length === 0) {
          socket.emit('error', { message: 'No questions in quiz' });
          return;
        }

        // Lifecycle transition — kept synchronous so restart resync works
        await prisma.session.update({
          where: { id: sessionId },
          data: { status: 'ACTIVE', startedAt: new Date(), currentQuestionIndex: 0 },
        });

        sendQuestion(io, ls, 0);
      } catch (err) {
        console.error('host:start error:', err);
      }
    });

    // ─── Player submits an answer (zero DB round-trips) ────────────
    socket.on('player:answer', (data: { answerIndex: number }) => {
      try {
        const sessionId = socket.data.sessionId;
        const playerId = socket.data.playerId;
        if (!sessionId || !playerId) return;

        const ls = getSession(sessionId);
        if (!ls || ls.status !== 'ACTIVE') return;

        const timer = ls.timer;
        if (!timer) return;

        const responseMs = Date.now() - timer.startedAt;

        // Check deadline (1s grace period)
        if (responseMs > timer.timeLimitMs + 1000) {
          socket.emit('player:answer:late', { message: 'Too late!' });
          return;
        }

        // Duplicate check — synchronous, so no race window
        if (ls.answered.has(playerId)) {
          socket.emit('player:answer:duplicate', { message: 'Already answered' });
          return;
        }

        const question = ls.questions[ls.currentQuestionIndex];
        if (!question || question.id !== timer.questionId) return;

        const isCorrect = question.correctIndices.includes(data.answerIndex);
        const points = calculateScore(
          Math.min(responseMs, timer.timeLimitMs),
          timer.timeLimitMs,
          question.pointsMode,
          isCorrect
        );

        // Memory only — persisted by the batch flusher
        recordAnswer(ls, {
          playerId,
          questionId: question.id,
          answerIndex: data.answerIndex,
          responseMs: Math.round(responseMs),
          pointsAwarded: points,
        });

        socket.emit('player:answer:received', { answerIndex: data.answerIndex });

        io.to(`host:${sessionId}`).emit('answer:count', {
          answered: ls.answered.size,
          total: ls.players.size,
        });
      } catch (err) {
        console.error('player:answer error:', err);
      }
    });

    // ─── Host reveals the answer ───────────────────────────────────
    socket.on('host:reveal', () => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId || !socket.data.isHost) return;

        const ls = getSession(sessionId);
        if (!ls || (ls.status !== 'ACTIVE' && ls.status !== 'REVEALING')) return;

        const question = ls.questions[ls.currentQuestionIndex];
        if (!question) return;

        clearQuestionTimeout(ls);
        ls.status = 'REVEALING';
        ls.lastActivity = Date.now();

        // Fire-and-forget: kept only so a server restart mid-reveal resyncs
        prisma.session
          .update({ where: { id: sessionId }, data: { status: 'REVEALING' } })
          .catch(console.error);

        // Natural flush boundary — reveal never waits on it
        void flushSession(ls).catch((err) =>
          console.error(`Reveal flush failed for session ${ls.id} (will retry):`, err)
        );

        const correctIndices = question.correctIndices;
        const answerCounts = ls.answerCounts;
        const { top10, rankByPlayerId } = getLeaderboard(ls);

        // Personalized result + rank per player — single pass, O(1) socket lookups
        for (const player of ls.players.values()) {
          if (!player.socketId) continue;
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (!playerSocket) continue;

          const response = ls.currentResponses.get(player.id);
          playerSocket.emit('question:result', {
            correctIndices,
            answerCounts,
            yourAnswer: response?.answerIndex ?? -1,
            yourPoints: response?.pointsAwarded ?? 0,
            isCorrect: response ? correctIndices.includes(response.answerIndex) : false,
          });
          playerSocket.emit('leaderboard:update', {
            top10,
            yourRank: rankByPlayerId.get(player.id) ?? 0,
            yourScore: player.totalScore,
          });
        }

        io.to(`host:${sessionId}`).emit('question:result', {
          correctIndices,
          answerCounts,
          totalResponses: ls.answered.size,
        });

        io.to(`host:${sessionId}`).emit('leaderboard:update', {
          top10,
          totalPlayers: ls.players.size,
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

        const ls = getSession(sessionId);
        if (!ls) return;

        const nextIndex = ls.currentQuestionIndex + 1;

        if (nextIndex >= ls.questions.length) {
          await endSession(io, ls);
          return;
        }

        // Lifecycle transition — kept synchronous for restart resync
        await prisma.session.update({
          where: { id: sessionId },
          data: { currentQuestionIndex: nextIndex, status: 'ACTIVE' },
        });

        sendQuestion(io, ls, nextIndex);
      } catch (err) {
        console.error('host:next error:', err);
      }
    });

    // ─── Host ends the session ─────────────────────────────────────
    socket.on('host:end', async () => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId || !socket.data.isHost) return;
        const ls = getSession(sessionId);
        if (!ls) return;
        await endSession(io, ls);
      } catch (err) {
        console.error('host:end error:', err);
      }
    });

    // ─── Disconnect ────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const { sessionId, playerId } = socket.data as { sessionId?: string; playerId?: string };
      if (sessionId && playerId) {
        const ls = getSession(sessionId);
        if (ls) detachSocket(ls, playerId, socket.id);
      }
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────

// Throttled lobby broadcast: leading + trailing edge, max ~3/s per session.
// Mid-game (the mass rejoin at host:start) only the host needs the list.
function broadcastLobby(io: Server, ls: LiveSession) {
  if (ls.status !== 'LOBBY') {
    io.to(`host:${ls.id}`).emit('lobby:update', { players: getLobbyPlayers(ls) });
    return;
  }

  if (ls.lobbyBroadcastTimer) {
    ls.lobbyBroadcastPending = true;
    return;
  }

  io.to(`session:${ls.id}`).emit('lobby:update', { players: getLobbyPlayers(ls) });
  ls.lobbyBroadcastTimer = setTimeout(() => {
    ls.lobbyBroadcastTimer = null;
    if (ls.lobbyBroadcastPending) {
      ls.lobbyBroadcastPending = false;
      broadcastLobby(io, ls);
    }
  }, LOBBY_BROADCAST_THROTTLE_MS);
}

function sendQuestion(io: Server, ls: LiveSession, index: number) {
  const question = ls.questions[index];
  const timeLimitMs = question.timeLimit * 1000;

  // Auto-broadcast that time is up (host can still manually reveal)
  const timeout = setTimeout(() => {
    io.to(`session:${ls.id}`).emit('question:timeup', { index });
  }, timeLimitMs + 500);

  startQuestion(ls, index, timeout);

  // Persisted so reconnecting clients / a restarted server can resync
  prisma.session
    .update({ where: { id: ls.id }, data: { questionStartedAt: new Date(ls.timer!.startedAt) } })
    .catch(console.error);

  // Broadcast to everyone in the session (answers without isCorrect)
  io.to(`session:${ls.id}`).emit('question:show', {
    index,
    prompt: question.prompt,
    media: question.mediaUrl,
    answers: question.answers.map((a) => ({ index: a.index, text: a.text })),
    timeLimit: question.timeLimit,
    serverStartTs: ls.timer!.startedAt,
    totalQuestions: ls.questions.length,
  });
}

// After a server restart mid-question, recreate the timer from the persisted
// start time so the round can finish; if time already ran out, leave it null —
// late answers are rejected and the host can still reveal/advance.
function resumeTimerIfNeeded(io: Server, ls: LiveSession) {
  if (ls.status !== 'ACTIVE' || ls.timer) return;
  const question = ls.questions[ls.currentQuestionIndex];
  const startedAt = ls.persistedQuestionStartedAt;
  if (!question || !startedAt) return;

  const timeLimitMs = question.timeLimit * 1000;
  const remaining = timeLimitMs + 500 - (Date.now() - startedAt);
  if (remaining <= 0) return;

  const index = ls.currentQuestionIndex;
  const timeout = setTimeout(() => {
    io.to(`session:${ls.id}`).emit('question:timeup', { index });
  }, remaining);

  ls.timer = { questionId: question.id, timeLimitMs, startedAt, timeout };
}

async function endSession(io: Server, ls: LiveSession) {
  if (ls.status === 'FINISHED') return; // double-end guard
  ls.status = 'FINISHED';
  clearQuestionTimeout(ls);

  // All responses/scores must land before results become queryable —
  // session:final triggers the results/CSV pages, which read Postgres.
  const clean = await waitForCleanFlush(ls);
  if (!clean) {
    console.error(
      `⚠️ Session ${ls.id}: final flush incomplete — results may be missing recent answers`
    );
  }

  await prisma.session.update({
    where: { id: ls.id },
    data: { status: 'FINISHED', endedAt: new Date() },
  });

  io.to(`session:${ls.id}`).emit('session:final', {
    sessionId: ls.id,
    leaderboard: getLeaderboard(ls).sorted,
  });

  deleteSession(ls.id);
}
