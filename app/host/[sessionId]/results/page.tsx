'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { TrophyIcon, DownloadBoxIcon, CrownIcon, StarBadgeIcon, StarIcon } from '@/components/icons';
import { LoadingScreen } from '@/components/LoadingScreen';

interface PlayerResult {
  id: string;
  nickname: string;
  totalScore: number;
  responses: {
    answerIndex: number;
    responseMs: number;
    pointsAwarded: number;
    question: {
      prompt: string;
      order: number;
      answers: { index: number; text: string; isCorrect: boolean }[];
    };
  }[];
}

interface SessionResults {
  id: string;
  quiz: { title: string };
  players: PlayerResult[];
}

export default function HostResultsPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [session, setSession] = useState<SessionResults | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'HOST')) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role === 'HOST') {
      api
        .get<{ session: SessionResults }>(`/api/session/${sessionId}/results`)
        .then((data) => setSession(data.session))
        .catch(() => router.push('/dashboard'))
        .finally(() => setLoading(false));
    }
  }, [user, sessionId, router]);

  const downloadCSV = async () => {
    // window.open can't send the Authorization header, so fetch + blob URL
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/session/${sessionId}/results/csv`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('quizify_token')}` } }
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quizify-results-${sessionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || loading || !session) {
    return (
      <LoadingScreen label="Loading results..." />
    );
  }

  const players = session.players;
  const winner = players[0];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-ink/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-sm text-ink/40 hover:text-ink/60 transition-colors">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold mt-1">{session.quiz.title} — Results</h1>
          </div>
          <button onClick={downloadCSV} className="btn-secondary text-sm">
            <DownloadBoxIcon size={16} /> Export CSV
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Winner highlight */}
        {winner && (
          <div className="glass-card p-8 text-center mb-8 animate-bounce-in">
            <TrophyIcon size={52} className="mx-auto mb-3" />
            <p className="text-sm text-ink/40 mb-1">Winner</p>
            <h2 className="text-3xl font-extrabold text-gradient mb-2">{winner.nickname}</h2>
            <p className="text-2xl font-bold text-brand-600">{winner.totalScore} points</p>
          </div>
        )}

        {/* Podium */}
        {players.length >= 3 && (
          <div className="flex items-end justify-center gap-4 mb-10">
            {/* 2nd place */}
            <div className="text-center animate-slide-up animate-delay-100">
              <div className="w-16 h-16 mx-auto rounded-full bg-slate-400/20 border-2 border-slate-400/40 flex items-center justify-center text-2xl mb-2">
                <StarBadgeIcon size={30} />
              </div>
              <p className="font-bold truncate max-w-[100px]">{players[1].nickname}</p>
              <p className="text-sm text-ink/40">{players[1].totalScore} pts</p>
            </div>
            {/* 1st place */}
            <div className="text-center animate-slide-up">
              <div className="w-20 h-20 mx-auto rounded-full bg-yellow-500/20 border-2 border-yellow-500/40 flex items-center justify-center text-3xl mb-2">
                <CrownIcon size={38} />
              </div>
              <p className="font-bold text-lg truncate max-w-[120px]">{players[0].nickname}</p>
              <p className="text-sm text-brand-600">{players[0].totalScore} pts</p>
            </div>
            {/* 3rd place */}
            <div className="text-center animate-slide-up animate-delay-200">
              <div className="w-16 h-16 mx-auto rounded-full bg-orange-700/20 border-2 border-orange-700/40 flex items-center justify-center text-2xl mb-2">
                <StarIcon size={30} />
              </div>
              <p className="font-bold truncate max-w-[100px]">{players[2].nickname}</p>
              <p className="text-sm text-ink/40">{players[2].totalScore} pts</p>
            </div>
          </div>
        )}

        {/* Full leaderboard table */}
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-ink/[0.06]">
            <h3 className="font-bold">Full Leaderboard</h3>
            <p className="text-sm text-ink/40">{players.length} participants</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink/40 border-b border-ink/[0.06]">
                  <th className="px-6 py-3 font-medium">Rank</th>
                  <th className="px-6 py-3 font-medium">Player</th>
                  <th className="px-6 py-3 font-medium text-right">Score</th>
                  <th className="px-6 py-3 font-medium text-right">Correct</th>
                  <th className="px-6 py-3 font-medium text-right">Avg Speed</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, i) => {
                  const correct = player.responses.filter((r) =>
                    r.question.answers.some(
                      (a) => a.index === r.answerIndex && a.isCorrect
                    )
                  ).length;
                  const avgMs = player.responses.length > 0
                    ? Math.round(
                        player.responses.reduce((sum, r) => sum + r.responseMs, 0) /
                          player.responses.length
                      )
                    : 0;

                  return (
                    <tr
                      key={player.id}
                      className="border-b border-ink/[0.03] hover:bg-ink/[0.02] transition-colors"
                    >
                      <td className="px-6 py-3">
                        <span className={`w-7 h-7 inline-flex items-center justify-center rounded-full text-xs font-bold ${
                          i === 0 ? 'bg-yellow-500 text-black' :
                          i === 1 ? 'bg-slate-400 text-black' :
                          i === 2 ? 'bg-orange-700 text-white' :
                          'bg-ink/10 text-ink/50'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-medium">{player.nickname}</td>
                      <td className="px-6 py-3 text-right font-bold text-brand-600">
                        {player.totalScore}
                      </td>
                      <td className="px-6 py-3 text-right text-ink/60">
                        {correct}/{player.responses.length}
                      </td>
                      <td className="px-6 py-3 text-right text-ink/60">
                        {avgMs > 0 ? `${(avgMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Back to dashboard */}
        <div className="text-center mt-8">
          <Link href="/dashboard" className="btn-secondary">
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
