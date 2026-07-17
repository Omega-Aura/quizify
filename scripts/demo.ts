/**
 * Demo script: Spins up a host session plus two simulated players.
 *
 * Usage: npm run demo
 *
 * Prerequisites:
 *  - Database seeded (npm run db:seed)
 *  - Server running (npm run dev:server)
 */

import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function apiGet<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function connectPlayer(name: string): Socket {
  return io(SOCKET_URL, { autoConnect: true });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('');
  console.log('🎮 Quizify Demo Script');
  console.log('======================\n');

  // 1. Login as host
  console.log('1️⃣  Logging in as host...');
  const { token: hostToken } = await apiPost<{ token: string }>('/api/auth/login', {
    email: 'host@quizify.dev',
    password: 'password123',
  });
  console.log('   ✓ Host logged in\n');

  // 2. Get quiz list
  const { quizzes } = await apiGet<{ quizzes: any[] }>('/api/quiz', hostToken);
  if (quizzes.length === 0) {
    console.error('   ✗ No quizzes found. Run `npm run db:seed` first.');
    process.exit(1);
  }
  const quiz = quizzes[0];
  console.log(`2️⃣  Using quiz: "${quiz.title}" (${quiz._count.questions} questions)\n`);

  // 3. Create session
  console.log('3️⃣  Creating live session...');
  const { session } = await apiPost<{ session: { id: string; pin: string } }>(
    '/api/session/create',
    { quizId: quiz.id },
    hostToken
  );
  console.log(`   ✓ Session created! PIN: ${session.pin}\n`);

  // 4. Connect host
  console.log('4️⃣  Connecting host to Socket.io...');
  const hostSocket = connectPlayer('Host');
  hostSocket.emit('host:join', { sessionId: session.id, token: hostToken });

  await sleep(500);
  console.log('   ✓ Host connected\n');

  // 5. Connect two players
  console.log('5️⃣  Connecting players...');
  const player1Socket = connectPlayer('Alice');
  const player2Socket = connectPlayer('Bob');

  let player1Id = '';
  let player2Id = '';

  player1Socket.on('player:joined', (data: any) => {
    player1Id = data.playerId;
    console.log(`   ✓ Alice joined (ID: ${data.playerId})`);
  });

  player2Socket.on('player:joined', (data: any) => {
    player2Id = data.playerId;
    console.log(`   ✓ Bob joined (ID: ${data.playerId})`);
  });

  player1Socket.emit('player:join', { pin: session.pin, nickname: 'Alice' });
  await sleep(300);
  player2Socket.emit('player:join', { pin: session.pin, nickname: 'Bob' });
  await sleep(500);
  console.log('');

  // 6. Get full quiz data for answer simulation
  const { quiz: fullQuiz } = await apiGet<{ quiz: any }>(`/api/quiz/${quiz.id}`, hostToken);
  const questions = fullQuiz.questions;

  // 7. Start game
  console.log('6️⃣  Starting game...\n');
  hostSocket.emit('host:start');
  await sleep(1000);

  // 8. Simulate answering questions
  let questionIndex = 0;

  const handleQuestion = async () => {
    if (questionIndex >= questions.length) return;

    const q = questions[questionIndex];
    const correctAnswer = q.answers.find((a: any) => a.isCorrect);
    console.log(`   📝 Q${questionIndex + 1}: ${q.prompt}`);
    console.log(`      Correct: ${correctAnswer?.text}`);

    // Alice answers correctly (fast)
    await sleep(500 + Math.random() * 1000);
    player1Socket.emit('player:answer', { answerIndex: correctAnswer?.index ?? 0 });
    console.log(`      Alice answered: ${correctAnswer?.text} ✓`);

    // Bob answers randomly (sometimes wrong)
    await sleep(800 + Math.random() * 1500);
    const bobAnswer = Math.random() > 0.4
      ? correctAnswer?.index ?? 0
      : Math.floor(Math.random() * q.answers.length);
    player2Socket.emit('player:answer', { answerIndex: bobAnswer });
    const bobCorrect = bobAnswer === correctAnswer?.index;
    console.log(`      Bob answered: ${q.answers[bobAnswer]?.text} ${bobCorrect ? '✓' : '✗'}`);

    // Host reveals
    await sleep(1000);
    hostSocket.emit('host:reveal');
    console.log('      → Answer revealed\n');

    questionIndex++;

    // Next question or end
    await sleep(1500);
    if (questionIndex < questions.length) {
      hostSocket.emit('host:next');
      await sleep(800);
      await handleQuestion();
    } else {
      hostSocket.emit('host:end');
    }
  };

  // Listen for questions
  player1Socket.on('question:show', () => {});
  player2Socket.on('question:show', () => {});

  hostSocket.on('question:show', async () => {
    await handleQuestion();
  });

  hostSocket.on('session:final', async (data: any) => {
    console.log('7️⃣  Game Over!\n');
    console.log('   🏆 Final Leaderboard:');
    data.leaderboard.forEach((p: any, i: number) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      console.log(`      ${medal} ${p.nickname}: ${p.totalScore} pts`);
    });
    console.log('\n✅ Demo complete!\n');

    // Cleanup
    hostSocket.disconnect();
    player1Socket.disconnect();
    player2Socket.disconnect();
    process.exit(0);
  });

  // Timeout fallback
  setTimeout(() => {
    console.log('\n⏰ Demo timed out after 2 minutes');
    hostSocket.disconnect();
    player1Socket.disconnect();
    player2Socket.disconnect();
    process.exit(1);
  }, 120_000);
}

main().catch((err) => {
  console.error('❌ Demo failed:', err);
  process.exit(1);
});
