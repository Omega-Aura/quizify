import { Prisma, PointsMode, SessionStatus } from '@prisma/client';
import { prisma } from './prisma';

// In-memory store for live sessions. During gameplay this store is the source
// of truth; Postgres is updated by the batch flusher (~5s) and at lifecycle
// transitions. Requires a single backend instance (see CLAUDE.md).

export interface CachedAnswer {
  index: number;
  text: string;
  imageUrl: string | null;
  isCorrect: boolean;
}

export interface CachedQuestion {
  id: string;
  order: number;
  prompt: string;
  mediaUrl: string | null;
  timeLimit: number; // seconds
  pointsMode: PointsMode;
  answers: CachedAnswer[];
  correctIndices: number[];
}

export interface PlayerState {
  id: string;
  nickname: string;
  totalScore: number;
  socketId: string | null;
  joinedAt: number;
}

export interface PendingResponse {
  playerId: string;
  questionId: string;
  answerIndex: number;
  responseMs: number;
  pointsAwarded: number;
}

export interface QuestionTimer {
  questionId: string;
  timeLimitMs: number;
  startedAt: number; // Date.now()
  timeout: NodeJS.Timeout;
}

export interface LiveSession {
  id: string;
  pin: string;
  quizId: string;
  hostId: string;
  status: SessionStatus;
  currentQuestionIndex: number;
  questions: CachedQuestion[];
  players: Map<string, PlayerState>;
  playersByNickname: Map<string, string>;

  // Current-question state (reset by startQuestion)
  answered: Set<string>;
  answerCounts: Record<number, number>;
  currentResponses: Map<string, PendingResponse>;
  timer: QuestionTimer | null;
  // Mirrors Session.questionStartedAt — lets a restarted server resume the
  // current question's timer (timer itself can't survive a restart).
  persistedQuestionStartedAt: number | null;

  // Flush state
  pendingResponses: PendingResponse[];
  dirtyScores: Set<string>;
  flushing: boolean;

  // Lobby broadcast throttle
  lobbyBroadcastTimer: NodeJS.Timeout | null;
  lobbyBroadcastPending: boolean;

  lastActivity: number;
}

const sessions = new Map<string, LiveSession>();
const sessionsByPin = new Map<string, string>();

// ─── Loading ─────────────────────────────────────────────────────────

const sessionInclude = {
  quiz: {
    select: {
      hostId: true,
      questions: {
        orderBy: { order: 'asc' as const },
        include: { answers: { orderBy: { index: 'asc' as const } } },
      },
    },
  },
  players: {
    orderBy: { joinedAt: 'asc' as const },
    select: { id: true, nickname: true, totalScore: true, joinedAt: true },
  },
};

type LoadedSession = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;

async function buildLiveSession(row: LoadedSession): Promise<LiveSession> {
  const questions: CachedQuestion[] = row.quiz.questions.map((q) => ({
    id: q.id,
    order: q.order,
    prompt: q.prompt,
    mediaUrl: q.mediaUrl,
    timeLimit: q.timeLimit,
    pointsMode: q.pointsMode,
    answers: q.answers.map((a) => ({
      index: a.index,
      text: a.text,
      imageUrl: a.imageUrl,
      isCorrect: a.isCorrect,
    })),
    correctIndices: q.answers.filter((a) => a.isCorrect).map((a) => a.index),
  }));

  const players = new Map<string, PlayerState>();
  const playersByNickname = new Map<string, string>();
  for (const p of row.players) {
    players.set(p.id, {
      id: p.id,
      nickname: p.nickname,
      totalScore: p.totalScore,
      socketId: null,
      joinedAt: p.joinedAt.getTime(),
    });
    playersByNickname.set(p.nickname, p.id);
  }

  const ls: LiveSession = {
    id: row.id,
    pin: row.pin,
    quizId: row.quizId,
    hostId: row.quiz.hostId,
    status: row.status,
    currentQuestionIndex: row.currentQuestionIndex,
    questions,
    players,
    playersByNickname,
    answered: new Set(),
    answerCounts: {},
    currentResponses: new Map(),
    timer: null,
    persistedQuestionStartedAt: row.questionStartedAt ? row.questionStartedAt.getTime() : null,
    pendingResponses: [],
    dirtyScores: new Set(),
    flushing: false,
    lobbyBroadcastTimer: null,
    lobbyBroadcastPending: false,
    lastActivity: Date.now(),
  };

  // Server-restart recovery: if the session was mid-game, rebuild the
  // current question's answered set from already-flushed responses so
  // players can't answer twice after a restart.
  if ((row.status === 'ACTIVE' || row.status === 'REVEALING') && questions[row.currentQuestionIndex]) {
    const currentQ = questions[row.currentQuestionIndex];
    for (const a of currentQ.answers) ls.answerCounts[a.index] = 0;
    const responses = await prisma.response.findMany({
      where: { questionId: currentQ.id, player: { sessionId: row.id } },
      select: { playerId: true, answerIndex: true, responseMs: true, pointsAwarded: true },
    });
    for (const r of responses) {
      ls.answered.add(r.playerId);
      ls.answerCounts[r.answerIndex] = (ls.answerCounts[r.answerIndex] || 0) + 1;
      ls.currentResponses.set(r.playerId, {
        playerId: r.playerId,
        questionId: currentQ.id,
        answerIndex: r.answerIndex,
        responseMs: r.responseMs,
        pointsAwarded: r.pointsAwarded,
      });
    }
  }

  return ls;
}

export function getSession(sessionId: string): LiveSession | undefined {
  return sessions.get(sessionId);
}

export async function getOrLoadSessionById(sessionId: string): Promise<LiveSession | null> {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const row = await prisma.session.findUnique({ where: { id: sessionId }, include: sessionInclude });
  if (!row || row.status === 'FINISHED') return null;
  return registerSession(await buildLiveSession(row));
}

export async function getOrLoadSessionByPin(pin: string): Promise<LiveSession | null> {
  const id = sessionsByPin.get(pin);
  if (id) {
    const existing = sessions.get(id);
    if (existing) return existing;
  }

  const row = await prisma.session.findUnique({ where: { pin }, include: sessionInclude });
  if (!row || row.status === 'FINISHED') return null;
  return registerSession(await buildLiveSession(row));
}

function registerSession(ls: LiveSession): LiveSession {
  // Another concurrent load may have won the race — keep the first one.
  const existing = sessions.get(ls.id);
  if (existing) return existing;
  sessions.set(ls.id, ls);
  sessionsByPin.set(ls.pin, ls.id);
  return ls;
}

export function deleteSession(sessionId: string): void {
  const ls = sessions.get(sessionId);
  if (!ls) return;
  if (ls.timer) clearTimeout(ls.timer.timeout);
  if (ls.lobbyBroadcastTimer) clearTimeout(ls.lobbyBroadcastTimer);
  sessions.delete(ls.id);
  sessionsByPin.delete(ls.pin);
}

export function allSessions(): IterableIterator<LiveSession> {
  return sessions.values();
}

// ─── Mutations (synchronous — single-threaded, so race-free) ─────────

export function addPlayer(
  ls: LiveSession,
  player: { id: string; nickname: string; totalScore: number; joinedAt: Date }
): PlayerState {
  const state: PlayerState = {
    id: player.id,
    nickname: player.nickname,
    totalScore: player.totalScore,
    socketId: null,
    joinedAt: player.joinedAt.getTime(),
  };
  ls.players.set(player.id, state);
  ls.playersByNickname.set(player.nickname, player.id);
  ls.lastActivity = Date.now();
  return state;
}

export function attachSocket(ls: LiveSession, playerId: string, socketId: string): void {
  const p = ls.players.get(playerId);
  if (p) p.socketId = socketId;
  ls.lastActivity = Date.now();
}

export function detachSocket(ls: LiveSession, playerId: string, socketId: string): void {
  const p = ls.players.get(playerId);
  // Only clear if this socket is still the player's current one — a stale
  // disconnect must not clobber a fresh reconnect.
  if (p && p.socketId === socketId) p.socketId = null;
}

export function recordAnswer(ls: LiveSession, response: PendingResponse): void {
  ls.answered.add(response.playerId);
  ls.currentResponses.set(response.playerId, response);
  ls.answerCounts[response.answerIndex] = (ls.answerCounts[response.answerIndex] || 0) + 1;
  ls.pendingResponses.push(response);

  const p = ls.players.get(response.playerId);
  if (p && response.pointsAwarded > 0) {
    p.totalScore += response.pointsAwarded;
    ls.dirtyScores.add(response.playerId);
  }
  ls.lastActivity = Date.now();
}

export function startQuestion(
  ls: LiveSession,
  index: number,
  timeout: NodeJS.Timeout
): CachedQuestion {
  if (ls.timer) clearTimeout(ls.timer.timeout);

  const question = ls.questions[index];
  ls.status = 'ACTIVE';
  ls.currentQuestionIndex = index;
  ls.answered = new Set();
  ls.currentResponses = new Map();
  ls.answerCounts = {};
  for (const a of question.answers) ls.answerCounts[a.index] = 0;
  ls.timer = {
    questionId: question.id,
    timeLimitMs: question.timeLimit * 1000,
    startedAt: Date.now(),
    timeout,
  };
  ls.persistedQuestionStartedAt = ls.timer.startedAt;
  ls.lastActivity = Date.now();
  return question;
}

export function clearQuestionTimeout(ls: LiveSession): void {
  if (ls.timer) clearTimeout(ls.timer.timeout);
}

// ─── Derived views ───────────────────────────────────────────────────

export function getLobbyPlayers(ls: LiveSession): { id: string; nickname: string; totalScore: number }[] {
  return [...ls.players.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({ id: p.id, nickname: p.nickname, totalScore: p.totalScore }));
}

export function getLeaderboard(ls: LiveSession): {
  sorted: { id: string; nickname: string; totalScore: number }[];
  top10: { id: string; nickname: string; totalScore: number }[];
  rankByPlayerId: Map<string, number>;
} {
  const sorted = [...ls.players.values()]
    .sort((a, b) => b.totalScore - a.totalScore || a.joinedAt - b.joinedAt)
    .map((p) => ({ id: p.id, nickname: p.nickname, totalScore: p.totalScore }));

  const rankByPlayerId = new Map<string, number>();
  sorted.forEach((p, i) => rankByPlayerId.set(p.id, i + 1));

  return { sorted, top10: sorted.slice(0, 10), rankByPlayerId };
}

// ─── Batch flusher ───────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 5000;
let flushInterval: NodeJS.Timeout | null = null;

export async function flushSession(ls: LiveSession): Promise<void> {
  if (ls.flushing) return;
  if (ls.pendingResponses.length === 0 && ls.dirtyScores.size === 0) return;
  ls.flushing = true;

  // Snapshot and clear so answers arriving mid-flush go to the next batch.
  const responses = ls.pendingResponses.splice(0);
  const dirty = [...ls.dirtyScores];
  ls.dirtyScores.clear();
  const scoreRows = dirty
    .map((id) => {
      const p = ls.players.get(id);
      return p ? { id, score: p.totalScore } : null;
    })
    .filter((r): r is { id: string; score: number } => r !== null);

  try {
    if (responses.length > 0) {
      // skipDuplicates + @@unique([playerId, questionId]) makes this idempotent.
      await prisma.response.createMany({ data: responses, skipDuplicates: true });
    }
    if (scoreRows.length > 0) {
      // Absolute SET from the in-memory value (not increment) — idempotent,
      // safe to retry after a partial failure. One statement for all rows.
      await prisma.$executeRaw`
        UPDATE "Player" AS p SET "totalScore" = v.score
        FROM (VALUES ${Prisma.join(
          scoreRows.map((r) => Prisma.sql`(${r.id}, ${r.score})`)
        )}) AS v(id, score)
        WHERE p.id = v.id`;
    }
  } catch (err) {
    // Re-queue everything; the next tick (or final flush) retries.
    ls.pendingResponses.unshift(...responses);
    for (const id of dirty) ls.dirtyScores.add(id);
    throw err;
  } finally {
    ls.flushing = false;
  }
}

export async function waitForCleanFlush(ls: LiveSession): Promise<boolean> {
  // Wait out any in-flight flush.
  while (ls.flushing) {
    await new Promise((r) => setTimeout(r, 50));
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await flushSession(ls);
      if (ls.pendingResponses.length === 0 && ls.dirtyScores.size === 0) return true;
    } catch (err) {
      console.error(`Final flush attempt ${attempt + 1} failed for session ${ls.id}:`, err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return ls.pendingResponses.length === 0 && ls.dirtyScores.size === 0;
}

export function startFlusher(): void {
  if (flushInterval) return;
  flushInterval = setInterval(() => {
    for (const ls of sessions.values()) {
      if (ls.pendingResponses.length > 0 || ls.dirtyScores.size > 0) {
        void flushSession(ls).catch((err) =>
          console.error(`Flush failed for session ${ls.id} (will retry):`, err)
        );
      }
    }
  }, FLUSH_INTERVAL_MS);
}

export function stopFlusher(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

// ─── TTL sweep for abandoned sessions ────────────────────────────────

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const SESSION_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
let sweepInterval: NodeJS.Timeout | null = null;

export function startTtlSweep(): void {
  if (sweepInterval) return;
  sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const ls of [...sessions.values()]) {
      if (now - ls.lastActivity > SESSION_IDLE_TTL_MS) {
        console.log(`🧹 Evicting idle session ${ls.id} (pin ${ls.pin})`);
        void (async () => {
          try {
            await flushSession(ls);
          } catch (err) {
            console.error(`Sweep flush failed for session ${ls.id}:`, err);
          }
          prisma.session
            .update({ where: { id: ls.id }, data: { status: 'FINISHED', endedAt: new Date() } })
            .catch(console.error);
          deleteSession(ls.id);
        })();
      }
    }
  }, SWEEP_INTERVAL_MS);
}

export function stopTtlSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}

// ─── Shutdown flush (SIGTERM on deploys) ─────────────────────────────

export async function flushAllSessions(): Promise<void> {
  await Promise.allSettled(
    [...sessions.values()].map((ls) =>
      flushSession(ls).catch((err) => console.error(`Shutdown flush failed for ${ls.id}:`, err))
    )
  );
}
