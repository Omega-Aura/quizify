/**
 * Live-quiz load test: simulates N players joining a session and answering
 * every question at random delays, then prints latency stats.
 *
 * Usage:
 *   1. Create a session in the UI and note its PIN (stay in the lobby).
 *   2. npx tsx scripts/load-test.ts --url http://localhost:3001 --pin 123456 --players 250
 *   3. Start the quiz from the host screen and step through it.
 *
 * The process exits when the session ends (session:final) or on Ctrl+C.
 */
import { io, Socket } from 'socket.io-client';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const URL = arg('url', 'http://localhost:3001');
const PIN = arg('pin', '');
const PLAYERS = parseInt(arg('players', '50'), 10);
const JOIN_RAMP_MS = parseInt(arg('ramp', '10000'), 10); // spread joins over this window

if (!PIN) {
  console.error('Missing --pin. Create a session in the UI first and pass its PIN.');
  process.exit(1);
}

const joinLatencies: number[] = [];
const answerLatencies: number[] = [];
let joined = 0;
let errors = 0;
let finished = false;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function spawnBot(n: number): Socket {
  const socket = io(URL, { transports: ['websocket'], reconnection: true });
  const nickname = `bot-${String(n).padStart(3, '0')}`;
  let answerSentAt = 0;
  let answeredIndex = -1;

  socket.on('connect', () => {
    const joinSentAt = Date.now();
    socket.emit('player:join', { pin: PIN, nickname });
    socket.once('player:joined', () => {
      joinLatencies.push(Date.now() - joinSentAt);
      joined++;
      if (joined === PLAYERS) {
        console.log(`✅ All ${PLAYERS} bots joined (p50 ${percentile(joinLatencies, 50)}ms, p95 ${percentile(joinLatencies, 95)}ms). Start the quiz from the host screen.`);
      }
    });
  });

  socket.on('question:show', (q: { index: number; timeLimit: number; answers: { index: number }[] }) => {
    if (q.index === answeredIndex) return; // resend/reconnect duplicate
    answeredIndex = q.index;
    // Answer at a random point in the first ~80% of the time limit
    const delay = 500 + Math.random() * q.timeLimit * 1000 * 0.8;
    setTimeout(() => {
      if (finished) return;
      answerSentAt = Date.now();
      const choice = q.answers[Math.floor(Math.random() * q.answers.length)].index;
      socket.emit('player:answer', { answerIndex: choice });
    }, delay);
  });

  socket.on('player:answer:received', () => {
    if (answerSentAt) answerLatencies.push(Date.now() - answerSentAt);
  });

  socket.on('error', (e: { message?: string }) => {
    errors++;
    if (errors <= 5) console.error(`❌ ${nickname}: ${e?.message ?? 'unknown error'}`);
  });

  socket.on('session:final', () => {
    if (!finished) {
      finished = true;
      report();
      setTimeout(() => process.exit(0), 500);
    }
  });

  return socket;
}

function report() {
  console.log('\n─── Load test results ───');
  console.log(`Bots joined:        ${joined}/${PLAYERS}`);
  console.log(`Errors:             ${errors}`);
  console.log(`Join latency:       p50 ${percentile(joinLatencies, 50)}ms  p95 ${percentile(joinLatencies, 95)}ms  max ${percentile(joinLatencies, 100)}ms`);
  console.log(`Answer-ack latency: p50 ${percentile(answerLatencies, 50)}ms  p95 ${percentile(answerLatencies, 95)}ms  max ${percentile(answerLatencies, 100)}ms  (n=${answerLatencies.length})`);
}

console.log(`Spawning ${PLAYERS} bots against ${URL} (pin ${PIN}), ramped over ${JOIN_RAMP_MS}ms...`);
for (let n = 1; n <= PLAYERS; n++) {
  setTimeout(() => spawnBot(n), Math.random() * JOIN_RAMP_MS);
}

process.on('SIGINT', () => {
  report();
  process.exit(0);
});
