'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface PlayerData {
  id: string;
  nickname: string;
  totalScore: number;
  rank: number;
  totalPlayers: number;
  quizTitle: string;
  responses: {
    answerIndex: number;
    responseMs: number;
    pointsAwarded: number;
    question: {
      prompt: string;
      answers: { index: number; text: string; isCorrect: boolean }[];
    };
  }[];
}

const SHAPES = ['▲', '◆', '●', '■'];

export default function ResultPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const playerId = sessionStorage.getItem(`player_${sessionId}`);
    if (!playerId) {
      router.push('/');
      return;
    }

    api
      .get<{ player: PlayerData }>(`/api/session/${sessionId}/player/${playerId}`)
      .then((data) => setPlayer(data.player))
      .catch(() => router.push('/'))
      .finally(() => setLoading(false));
  }, [sessionId, router]);

  if (loading || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink/50">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading results...
        </div>
      </div>
    );
  }

  const correct = player.responses.filter((r) =>
    r.question.answers.some((a) => a.index === r.answerIndex && a.isCorrect)
  ).length;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8 animate-bounce-in">
          <div className="text-5xl mb-3">
            {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : '🎮'}
          </div>
          <p className="text-sm text-ink/40 mb-1">{player.quizTitle}</p>
          <h1 className="text-3xl font-extrabold text-gradient mb-2">{player.nickname}</h1>
          <div className="flex items-center justify-center gap-6 text-lg">
            <div>
              <span className="text-ink/40 text-sm block">Rank</span>
              <span className="font-bold text-brand-600">#{player.rank}</span>
              <span className="text-ink/30 text-sm">/{player.totalPlayers}</span>
            </div>
            <div className="w-px h-10 bg-ink/10" />
            <div>
              <span className="text-ink/40 text-sm block">Score</span>
              <span className="font-bold text-brand-600">{player.totalScore}</span>
            </div>
            <div className="w-px h-10 bg-ink/10" />
            <div>
              <span className="text-ink/40 text-sm block">Correct</span>
              <span className="font-bold text-green-600">{correct}/{player.responses.length}</span>
            </div>
          </div>
        </div>

        {/* Per-question breakdown */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-ink/40 uppercase tracking-wider">
            Question Breakdown
          </h2>

          {player.responses.map((resp, i) => {
            const isCorrect = resp.question.answers.some(
              (a) => a.index === resp.answerIndex && a.isCorrect
            );
            const correctAnswer = resp.question.answers.find((a) => a.isCorrect);
            const chosenAnswer = resp.question.answers.find(
              (a) => a.index === resp.answerIndex
            );

            return (
              <div
                key={i}
                className={`glass-card p-4 animate-slide-up ${
                  isCorrect ? 'border-green-500/20' : 'border-red-500/20'
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-sm flex-1 pr-4">
                    Q{i + 1}. {resp.question.prompt}
                  </p>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    isCorrect
                      ? 'bg-green-500/20 text-green-600'
                      : 'bg-red-500/20 text-red-600'
                  }`}>
                    {isCorrect ? `+${resp.pointsAwarded}` : 'Wrong'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-ink/40">
                  <span>
                    Your answer:{' '}
                    <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>
                      {chosenAnswer?.text || '—'}
                    </span>
                  </span>
                  {!isCorrect && correctAnswer && (
                    <span>
                      Correct: <span className="text-green-600">{correctAnswer.text}</span>
                    </span>
                  )}
                  <span className="ml-auto">
                    {(resp.responseMs / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center mt-8">
          <Link href="/" className="btn-primary">
            Play Again
          </Link>
        </div>
      </div>
    </div>
  );
}
