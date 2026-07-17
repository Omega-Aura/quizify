'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket, connectSocket } from '@/lib/socket';

// ─── Types ───────────────────────────────────────────────────────────

type GamePhase = 'WAITING' | 'QUESTION' | 'ANSWERED' | 'REVEAL' | 'LEADERBOARD' | 'FINISHED';

interface QuestionData {
  index: number;
  prompt: string;
  media: string | null;
  answers: { index: number; text: string }[];
  timeLimit: number;
  serverStartTs: number;
  totalQuestions: number;
}

interface ResultData {
  correctIndices: number[];
  answerCounts: Record<number, number>;
  yourAnswer: number;
  yourPoints: number;
  isCorrect: boolean;
}

interface LeaderboardEntry {
  id: string;
  nickname: string;
  totalScore: number;
}

interface LeaderboardData {
  top10: LeaderboardEntry[];
  yourRank: number;
  yourScore: number;
}

const SHAPES = ['▲', '◆', '●', '■'];
const CARD_CLASSES = [
  'bg-answer-red hover:bg-answer-red-hover shadow-glow-red',
  'bg-answer-blue hover:bg-answer-blue-hover shadow-glow-blue',
  'bg-answer-yellow hover:bg-answer-yellow-hover shadow-glow-yellow',
  'bg-answer-green hover:bg-answer-green-hover shadow-glow-green',
];
const CARD_CLASSES_DISABLED = [
  'bg-answer-red/30',
  'bg-answer-blue/30',
  'bg-answer-yellow/30',
  'bg-answer-green/30',
];

// ─── Confetti helper ─────────────────────────────────────────────────

function spawnConfetti() {
  const colors = ['#f4586a', '#3d8bff', '#f7b53b', '#43cf8e', '#2563eb', '#e23b50'];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-particle';
    el.style.left = `${Math.random() * 100}vw`;
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.width = `${6 + Math.random() * 8}px`;
    el.style.height = `${6 + Math.random() * 8}px`;
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    el.style.animationDuration = `${2 + Math.random() * 2}s`;
    el.style.animationDelay = `${Math.random() * 0.5}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

// ─── Component ───────────────────────────────────────────────────────

export default function PlayPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const { sessionId } = params;

  const [phase, setPhase] = useState<GamePhase>('WAITING');
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [finalLeaderboard, setFinalLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerId] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem(`player_${sessionId}`) || '' : ''
  );

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Socket events ────────────────────────────────────────────────

  useEffect(() => {
    const socket = connectSocket();

    const onQuestionShow = (data: QuestionData) => {
      setQuestion(data);
      setSelectedAnswer(null);
      setResult(null);
      setLeaderboard(null);
      setPhase('QUESTION');
      setTimeLeft(data.timeLimit);

      // Start countdown using the server timestamp for proper sync
      if (timerRef.current) clearInterval(timerRef.current);
      const startTime = data.serverStartTs || Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, data.timeLimit - elapsed);
        setTimeLeft(remaining);
        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 100);
    };

    const onAnswerReceived = (data: { answerIndex: number }) => {
      setPhase('ANSWERED');
    };

    const onQuestionResult = (data: ResultData) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setResult(data);
      setPhase('REVEAL');
      if (data.isCorrect) {
        spawnConfetti();
        setTotalScore((prev) => prev + data.yourPoints);
      }
    };

    const onLeaderboardUpdate = (data: LeaderboardData) => {
      setLeaderboard(data);
      setTotalScore(data.yourScore);
      // Auto show leaderboard after a short delay
      setTimeout(() => setPhase('LEADERBOARD'), 2000);
    };

    const onSessionFinal = (data: { sessionId: string; leaderboard: LeaderboardEntry[] }) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setFinalLeaderboard(data.leaderboard);
      setPhase('FINISHED');
    };

    const onTimeUp = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);
    };

    socket.on('question:show', onQuestionShow);
    socket.on('player:answer:received', onAnswerReceived);
    socket.on('question:result', onQuestionResult);
    socket.on('leaderboard:update', onLeaderboardUpdate);
    socket.on('session:final', onSessionFinal);
    socket.on('question:timeup', onTimeUp);

    // Re-join the session room — the socket may have been disconnected/reconnected
    // during Next.js page navigation, so the new socket is not in any room.
    const pin = sessionStorage.getItem(`pin_${sessionId}`) || '';
    const nickname = sessionStorage.getItem(`nickname_${sessionId}`) || '';
    const token = typeof window !== 'undefined' ? localStorage.getItem('quizify_token') : null;
    if (pin && nickname) {
      socket.emit('player:join', { pin, nickname, token });
    }

    // Check for pending question data stored by the join page
    // (the first question:show event is consumed by the join page before navigation)
    const pendingKey = `pending_question_${sessionId}`;
    const pendingData = sessionStorage.getItem(pendingKey);
    if (pendingData) {
      sessionStorage.removeItem(pendingKey);
      try {
        const questionData = JSON.parse(pendingData) as QuestionData;
        onQuestionShow(questionData);
      } catch { /* ignore parse errors */ }
    }

    return () => {
      socket.off('question:show', onQuestionShow);
      socket.off('player:answer:received', onAnswerReceived);
      socket.off('question:result', onQuestionResult);
      socket.off('leaderboard:update', onLeaderboardUpdate);
      socket.off('session:final', onSessionFinal);
      socket.off('question:timeup', onTimeUp);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId]);

  // ─── Submit answer ────────────────────────────────────────────────

  const submitAnswer = useCallback(
    (answerIndex: number) => {
      if (phase !== 'QUESTION' || selectedAnswer !== null) return;
      setSelectedAnswer(answerIndex);
      setPhase('ANSWERED');

      const socket = getSocket();
      socket.emit('player:answer', { answerIndex });
    },
    [phase, selectedAnswer]
  );

  // ─── Countdown ring ──────────────────────────────────────────────

  const circumference = 2 * Math.PI * 45;
  const timeProgress = question ? timeLeft / question.timeLimit : 1;
  const strokeDashoffset = circumference * (1 - timeProgress);

  // ─── Render phases ────────────────────────────────────────────────

  // WAITING
  if (phase === 'WAITING') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-brand-600 flex items-center justify-center animate-pulse-slow">
            <span className="text-3xl">🎮</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Get Ready!</h1>
          <p className="text-ink/40">Waiting for the host to start...</p>
          <div className="mt-8 flex items-center justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-3 h-3 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // QUESTION / ANSWERED
  if (phase === 'QUESTION' || phase === 'ANSWERED') {
    return (
      <div className="min-h-screen flex flex-col p-4 sm:p-6">
        {/* Top bar with timer and progress */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink/40">
              Q{(question?.index ?? 0) + 1}/{question?.totalQuestions ?? 0}
            </span>
          </div>

          {/* Countdown */}
          <div className="relative w-16 h-16">
            <svg className="countdown-ring w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" stroke="rgba(23,26,46,0.1)" />
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke={timeLeft <= 5 ? '#f4586a' : timeLeft <= 10 ? '#f7b53b' : '#3d8bff'}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-100"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${timeLeft <= 5 ? 'text-red-600' : 'text-ink'}`} aria-live="polite">
                {Math.ceil(timeLeft)}
              </span>
            </div>
          </div>

          <div className="text-sm text-ink/40">
            Score: <span className="text-brand-600 font-bold">{totalScore}</span>
          </div>
        </div>

        {/* Question */}
        <div className="text-center mb-8 animate-slide-down">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight">
            {question?.prompt}
          </h2>
          {question?.media && (
            <img src={question.media} alt="" className="max-h-40 mx-auto mt-4 rounded-xl" />
          )}
        </div>

        {/* Answer tiles */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-3xl mx-auto w-full">
          {question?.answers.map((answer, i) => {
            const isSelected = selectedAnswer === i;
            const isDisabled = phase === 'ANSWERED';

            return (
              <button
                key={i}
                onClick={() => submitAnswer(answer.index)}
                disabled={isDisabled}
                className={`
                  relative flex items-center gap-4 p-5 sm:p-6 rounded-xl
                  font-bold text-lg sm:text-xl text-white
                  transition-all duration-200
                  ${isDisabled ? CARD_CLASSES_DISABLED[i] : CARD_CLASSES[i]}
                  ${isSelected ? 'ring-4 ring-ink/60 scale-[0.97]' : ''}
                  ${!isDisabled ? 'active:scale-[0.95] cursor-pointer' : 'cursor-default'}
                `}
                aria-label={`Answer: ${answer.text}`}
              >
                <span className="text-2xl opacity-70 flex-shrink-0">{SHAPES[i]}</span>
                <span className="flex-1 text-left">{answer.text}</span>
                {isSelected && (
                  <span className="text-2xl animate-bounce-in">✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Answered state */}
        {phase === 'ANSWERED' && (
          <div className="text-center mt-6 animate-fade-in">
            <p className="text-ink/50">Answer locked in! Waiting for reveal...</p>
          </div>
        )}
      </div>
    );
  }

  // REVEAL
  if (phase === 'REVEAL' && result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-md w-full animate-bounce-in">
          {/* Result icon */}
          <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center text-5xl ${
            result.isCorrect
              ? 'bg-green-500/20 border-2 border-green-500/40'
              : 'bg-red-500/20 border-2 border-red-500/40'
          }`}>
            {result.isCorrect ? '🎉' : '😅'}
          </div>

          <h2 className={`text-3xl font-bold mb-2 ${result.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
            {result.isCorrect ? 'Correct!' : 'Not quite!'}
          </h2>

          {result.isCorrect && (
            <p className="text-2xl font-bold text-brand-600 mb-4">
              +{result.yourPoints} points
            </p>
          )}

          {/* Show correct answer if wrong */}
          {!result.isCorrect && question && (
            <p className="text-ink/50 mb-4">
              Correct answer: <span className="text-green-600 font-medium">
                {question.answers.find((a) => result.correctIndices.includes(a.index))?.text}
              </span>
            </p>
          )}

          {/* Answer distribution */}
          <div className="glass-card p-5 mt-6">
            <h3 className="text-sm text-ink/40 mb-3">Answer Distribution</h3>
            <div className="space-y-2">
              {question?.answers.map((answer, i) => {
                const count = result.answerCounts[answer.index] || 0;
                const total = Object.values(result.answerCounts).reduce((a, b) => a + b, 0) || 1;
                const pct = Math.round((count / total) * 100);
                const isCorrect = result.correctIndices.includes(answer.index);

                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm w-6">{SHAPES[i]}</span>
                    <div className="flex-1 h-8 bg-ink/[0.05] rounded-lg overflow-hidden relative">
                      <div
                        className={`h-full rounded-lg transition-all duration-1000 ${
                          isCorrect ? 'bg-green-500/60' : 'bg-ink/10'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-3 text-xs font-medium">
                        {answer.text} ({count})
                      </span>
                    </div>
                    {isCorrect && <span className="text-green-600 text-sm">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-6 text-sm text-ink/30">
            Total score: <span className="text-brand-600 font-bold">{totalScore}</span>
          </p>
        </div>
      </div>
    );
  }

  // LEADERBOARD
  if (phase === 'LEADERBOARD' && leaderboard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-md w-full">
          <h2 className="text-2xl font-bold mb-2 animate-fade-in">🏆 Leaderboard</h2>
          <p className="text-ink/40 mb-6 animate-fade-in">
            You&apos;re ranked <span className="text-brand-600 font-bold">#{leaderboard.yourRank}</span>
          </p>

          <div className="glass-card overflow-hidden">
            {leaderboard.top10.map((entry, i) => (
              <div
                key={entry.id}
                className={`leaderboard-row animate-slide-in-left ${entry.id === playerId ? 'bg-brand-600/15 border-brand-500/30' : ''}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  i === 0 ? 'bg-yellow-500 text-black' :
                  i === 1 ? 'bg-slate-400 text-black' :
                  i === 2 ? 'bg-orange-700 text-white' :
                  'bg-ink/10 text-ink/50'
                }`}>
                  {i + 1}
                </span>
                <span className="flex-1 font-medium text-left truncate">{entry.nickname}</span>
                <span className="font-bold text-brand-600">{entry.totalScore}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-center gap-1 animate-fade-in">
            <p className="text-sm text-ink/30">Next question coming up...</p>
          </div>
        </div>
      </div>
    );
  }

  // FINISHED
  if (phase === 'FINISHED') {
    const myRank = finalLeaderboard.findIndex((p) => p.id === playerId) + 1;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-md w-full animate-bounce-in">
          <div className="text-6xl mb-4">
            {myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎮'}
          </div>
          <h1 className="text-4xl font-extrabold mb-2 text-gradient">Game Over!</h1>
          <p className="text-xl text-ink/50 mb-2">
            You finished <span className="text-brand-600 font-bold">#{myRank || '?'}</span>
          </p>
          <p className="text-3xl font-bold text-brand-600 mb-8">{totalScore} pts</p>

          <div className="glass-card overflow-hidden mb-8">
            {finalLeaderboard.slice(0, 10).map((entry, i) => (
              <div
                key={entry.id}
                className={`leaderboard-row ${entry.id === playerId ? 'bg-brand-600/15 border-brand-500/30' : ''}`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  i === 0 ? 'bg-yellow-500 text-black' :
                  i === 1 ? 'bg-slate-400 text-black' :
                  i === 2 ? 'bg-orange-700 text-white' :
                  'bg-ink/10 text-ink/50'
                }`}>
                  {i + 1}
                </span>
                <span className="flex-1 font-medium text-left truncate">{entry.nickname}</span>
                <span className="font-bold text-brand-600">{entry.totalScore}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-center">
            <button onClick={() => router.push(`/result/${sessionId}`)} className="btn-primary">
              View Details
            </button>
            <button onClick={() => router.push('/')} className="btn-secondary">
              Play Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
