'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { connectSocket, getSocket, disconnectSocket } from '@/lib/socket';
import { TrophyIcon, PartyPopperIcon, ButtonPlayIcon } from '@/components/icons';
import { QRCodeSVG } from 'qrcode.react';

// ─── Types ───────────────────────────────────────────────────────────

type HostPhase = 'LOBBY' | 'QUESTION' | 'REVEAL' | 'LEADERBOARD' | 'FINISHED';

interface Player { id: string; nickname: string; totalScore: number }
interface Answer { index: number; text: string }
interface Question {
  prompt: string;
  mediaUrl: string | null;
  timeLimit: number;
  answers: { index: number; text: string; isCorrect: boolean }[];
}

const SHAPES = ['▲', '◆', '●', '■'];
const BG_COLORS = ['bg-answer-red', 'bg-answer-blue', 'bg-answer-yellow', 'bg-answer-green'];

export default function HostPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<HostPhase>('LOBBY');
  const [pin, setPin] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerCount, setAnswerCount] = useState({ answered: 0, total: 0 });
  const [answerCounts, setAnswerCounts] = useState<Record<number, number>>({});
  const [correctIndices, setCorrectIndices] = useState<number[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [quizTitle, setQuizTitle] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playersRef = useRef<Player[]>([]);
  playersRef.current = players;

  // Deep-link players scan to join with the PIN pre-filled (set after mount
  // so window is available and the URL matches whatever origin serves the app)
  const [joinUrl, setJoinUrl] = useState('');
  const [joinHost, setJoinHost] = useState('');
  useEffect(() => {
    if (!pin) return;
    const origin = window.location.origin;
    setJoinUrl(`${origin}/?pin=${pin}`);
    setJoinHost(new URL(origin).host);
  }, [pin]);

  // ─── Load session data ────────────────────────────────────────────

  useEffect(() => {
    if (authLoading || !user || !token) return;

    api.get<{ session: any }>(`/api/session/${sessionId}`).then((data) => {
      setPin(data.session.pin);
      setQuizTitle(data.session.quiz.title);
      setQuestions(data.session.quiz.questions);
      setPlayers(data.session.players);

      if (data.session.status === 'FINISHED') {
        router.push(`/host/${sessionId}/results`);
      }
    }).catch(() => router.push('/dashboard'));
  }, [sessionId, user, token, authLoading, router]);

  // ─── Socket connection ────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;

    const socket = connectSocket();
    socket.emit('host:join', { sessionId, token });

    socket.on('host:joined', (data: any) => {
      setPin(data.pin);
      setPlayers(data.players || []);
    });

    socket.on('lobby:update', (data: { players: Player[] }) => {
      setPlayers(data.players);
    });

    socket.on('question:show', (data: any) => {
      setCurrentIndex(data.index);
      setPhase('QUESTION');
      setTimeLeft(data.timeLimit);
      setAnswerCount({ answered: 0, total: playersRef.current.length });
      setAnswerCounts({});

      // Countdown synced to the server's question start timestamp
      if (timerRef.current) clearInterval(timerRef.current);
      const startTime = data.serverStartTs || Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, data.timeLimit - elapsed);
        setTimeLeft(remaining);
        if (remaining <= 0 && timerRef.current) clearInterval(timerRef.current);
      }, 100);
    });

    socket.on('answer:count', (data: { answered: number; total: number }) => {
      setAnswerCount(data);
    });

    socket.on('question:result', (data: any) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setAnswerCounts(data.answerCounts || {});
      setCorrectIndices(data.correctIndices || []);
      setPhase('REVEAL');
    });

    socket.on('leaderboard:update', (data: any) => {
      setLeaderboard(data.top10 || []);
    });

    socket.on('session:final', () => {
      setPhase('FINISHED');
    });

    return () => {
      socket.off('host:joined');
      socket.off('lobby:update');
      socket.off('question:show');
      socket.off('answer:count');
      socket.off('question:result');
      socket.off('leaderboard:update');
      socket.off('session:final');
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId, token]);

  // ─── Actions ──────────────────────────────────────────────────────

  const startGame = () => getSocket().emit('host:start');
  const revealAnswer = () => getSocket().emit('host:reveal');
  const nextQuestion = () => {
    // Phase flips to QUESTION when the server's question:show arrives —
    // flipping it here would briefly show the previous question's stale
    // content and timer during the round trip.
    getSocket().emit('host:next');
  };
  const showLeaderboard = () => setPhase('LEADERBOARD');
  const endGame = () => getSocket().emit('host:end');

  const currentQ = questions[currentIndex];
  const isLastQuestion = currentIndex >= questions.length - 1;

  // ─── LOBBY ────────────────────────────────────────────────────────

  if (phase === 'LOBBY') {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-ink/[0.06]">
          <div>
            <h1 className="text-lg font-bold">{quizTitle || 'Quiz'}</h1>
            <p className="text-xs text-ink/40">{questions.length} questions</p>
          </div>
          <button onClick={startGame} disabled={players.length === 0} className="btn-primary">
            <ButtonPlayIcon size={16} /> Start Game ({players.length} player{players.length !== 1 ? 's' : ''})
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="text-center mb-10 animate-fade-in">
            <p className="text-xs text-ink/45 mb-3 uppercase tracking-[0.35em] font-mono">Game PIN</p>
            <div className="text-7xl sm:text-8xl font-mono font-bold tracking-[0.15em] text-brand-600 animate-breathe mb-4 [text-shadow:0_0_40px_rgba(61,139,255,0.4)]">
              {pin}
            </div>
            <p className="text-ink/45 mb-6">
              Join at{' '}
              <span className="text-brand-600 font-medium">{joinHost || 'quizify.aritra.tech'}</span>{' '}
              or scan the code
            </p>
            {joinUrl && (
              <div className="inline-flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-ink/[0.12] shadow-[0_16px_40px_-22px_rgba(23,26,46,0.25)]">
                <QRCodeSVG value={joinUrl} size={168} level="M" fgColor="#171a2e" bgColor="#ffffff" />
                <span className="text-xs text-ink/45 font-medium">Scan to join</span>
              </div>
            )}
          </div>

          {/* Players */}
          <div className="glass-card p-6 w-full max-w-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Players</h2>
              <span className="text-brand-600 font-bold">{players.length}</span>
            </div>
            {players.length === 0 ? (
              <p className="text-center text-ink/30 py-8">Waiting for players to join...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {players.map((p, i) => (
                  <div key={p.id} className="px-4 py-2 rounded-full bg-ink/[0.06] text-sm font-medium animate-bounce-in" style={{ animationDelay: `${i * 50}ms` }}>
                    {p.nickname}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ─── QUESTION ─────────────────────────────────────────────────────

  if (phase === 'QUESTION' && currentQ) {
    return (
      <div className="min-h-screen flex flex-col p-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-ink/40">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-ink/40">
              {answerCount.answered}/{players.length} answered
            </span>
            <span className={`text-3xl font-bold ${timeLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-brand-600'}`}>
              {Math.ceil(timeLeft)}s
            </span>
          </div>
        </div>

        {/* Question */}
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold animate-slide-down">
            {currentQ.prompt}
          </h2>
          {currentQ.mediaUrl && (
            <img src={currentQ.mediaUrl} alt="" className="max-h-64 mx-auto mt-6 rounded-xl" />
          )}
        </div>

        {/* Answer tiles (large for projection) */}
        <div className="flex-1 grid grid-cols-2 gap-4 max-w-5xl mx-auto w-full">
          {currentQ.answers.map((answer, i) => (
            <div
              key={i}
              className={`${BG_COLORS[i]} text-white rounded-2xl p-8 flex items-center gap-4 animate-slide-up`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <span className="text-4xl opacity-60">{SHAPES[i]}</span>
              <span className="text-2xl font-bold">{answer.text}</span>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 mt-6">
          <button onClick={revealAnswer} className="btn-primary text-lg px-8">
            Reveal Answer
          </button>
          <button onClick={() => { nextQuestion(); }} className="btn-secondary">
            Skip →
          </button>
        </div>
      </div>
    );
  }

  // ─── REVEAL ───────────────────────────────────────────────────────

  if (phase === 'REVEAL' && currentQ) {
    const totalResponses = Object.values(answerCounts).reduce((a, b) => a + b, 0) || 1;

    return (
      <div className="min-h-screen flex flex-col p-6">
        <div className="text-center mb-6">
          <p className="text-sm text-ink/40 mb-2">Question {currentIndex + 1} of {questions.length}</p>
          <h2 className="text-2xl sm:text-3xl font-bold">{currentQ.prompt}</h2>
        </div>

        {/* Answer bars */}
        <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full space-y-4">
          {currentQ.answers.map((answer, i) => {
            const count = answerCounts[answer.index] || 0;
            const pct = Math.round((count / totalResponses) * 100);
            const isCorrect = correctIndices.includes(answer.index);

            return (
              <div key={i} className="animate-slide-in-left" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${BG_COLORS[i]} text-white flex items-center justify-center text-xl ${
                    isCorrect ? 'ring-2 ring-green-400' : 'opacity-50'
                  }`}>
                    {SHAPES[i]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium ${isCorrect ? 'text-green-600' : 'text-ink/60'}`}>
                        {answer.text} {isCorrect && '✓'}
                      </span>
                      <span className="text-sm text-ink/40">{count} ({pct}%)</span>
                    </div>
                    <div className="h-8 bg-ink/[0.05] rounded-lg overflow-hidden">
                      <div
                        className={`h-full rounded-lg transition-all duration-1000 ease-out ${
                          isCorrect ? 'bg-green-500/60' : 'bg-ink/10'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 mt-8">
          <button onClick={showLeaderboard} className="btn-secondary">
            <TrophyIcon size={16} /> Leaderboard
          </button>
          {isLastQuestion ? (
            <button onClick={endGame} className="btn-primary text-lg px-8">
              End Game <PartyPopperIcon size={18} />
            </button>
          ) : (
            <button onClick={nextQuestion} className="btn-primary text-lg px-8">
              Next Question →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── LEADERBOARD ──────────────────────────────────────────────────

  if (phase === 'LEADERBOARD') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-lg w-full">
          <h2 className="text-4xl font-extrabold mb-8 animate-fade-in flex items-center justify-center gap-3">
            <TrophyIcon size={36} /> Leaderboard
          </h2>

          <div className="space-y-3">
            {leaderboard.map((player, i) => (
              <div
                key={player.id}
                className="leaderboard-row animate-slide-in-left"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <span className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  i === 0 ? 'bg-yellow-500 text-black text-lg' :
                  i === 1 ? 'bg-slate-400 text-black' :
                  i === 2 ? 'bg-orange-700 text-white' :
                  'bg-ink/10 text-ink/50'
                }`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-left text-lg font-medium">{player.nickname}</span>
                <span className="text-xl font-bold text-brand-600">{player.totalScore}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-4 mt-10">
            {isLastQuestion ? (
              <button onClick={endGame} className="btn-primary text-lg px-8">
                End Game <PartyPopperIcon size={18} />
              </button>
            ) : (
              <button onClick={nextQuestion} className="btn-primary text-lg px-8">
                Next Question →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── FINISHED ─────────────────────────────────────────────────────

  if (phase === 'FINISHED') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center animate-bounce-in">
          <PartyPopperIcon size={64} className="mx-auto mb-4" />
          <h1 className="text-4xl font-extrabold text-gradient mb-4">Game Over!</h1>
          <p className="text-ink/40 mb-8">Great session! Check out the full results.</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push(`/host/${sessionId}/results`)}
              className="btn-primary text-lg px-8"
            >
              View Results
            </button>
            <button onClick={() => router.push('/dashboard')} className="btn-secondary">
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-ink/50">
        <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading session...
      </div>
    </div>
  );
}
