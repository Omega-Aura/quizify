'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { questions: number; sessions: number };
}

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'HOST')) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role === 'HOST') {
      loadQuizzes();
    }
  }, [user]);

  const loadQuizzes = async () => {
    try {
      const data = await api.get<{ quizzes: Quiz[] }>('/api/quiz');
      setQuizzes(data.quizzes);
    } catch (err) {
      console.error('Failed to load quizzes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this quiz? This cannot be undone.')) return;
    setActionLoading(id);
    try {
      await api.delete(`/api/quiz/${id}`);
      setQuizzes((prev) => prev.filter((q) => q.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post(`/api/quiz/${id}/duplicate`);
      await loadQuizzes();
    } catch (err) {
      console.error('Duplicate failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleHostLive = async (quizId: string) => {
    setActionLoading(quizId);
    try {
      const data = await api.post<{ session: { id: string } }>('/api/session/create', { quizId });
      router.push(`/host/${data.session.id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to create session');
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink/50">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-ink/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={34} />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-ink/40">{user?.name}</span>
            <button onClick={logout} className="text-sm text-ink/40 hover:text-ink/60 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Title row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-semibold">My Quizzes</h1>
            <p className="text-ink/45 mt-1">{quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}</p>
          </div>
          <Link href="/quiz/new" className="btn-primary">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Quiz
          </Link>
        </div>

        {/* Quiz grid */}
        {quizzes.length === 0 ? (
          <div className="glass-card p-16 text-center animate-fade-in">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-xl font-bold mb-2">No quizzes yet</h2>
            <p className="text-ink/40 mb-6">Create your first quiz and start hosting live sessions</p>
            <Link href="/quiz/new" className="btn-primary">
              Create your first quiz
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz, i) => (
              <div
                key={quiz.id}
                className="glass-card-hover p-6 flex flex-col animate-slide-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* Quiz info */}
                <div className="flex-1 mb-4">
                  <h3 className="text-lg font-bold mb-1 line-clamp-2">{quiz.title}</h3>
                  {quiz.description && (
                    <p className="text-sm text-ink/40 line-clamp-2">{quiz.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-xs text-ink/30">
                    <span>{quiz._count.questions} question{quiz._count.questions !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{quiz._count.sessions} session{quiz._count.sessions !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-ink/[0.06]">
                  <button
                    onClick={() => handleHostLive(quiz.id)}
                    disabled={actionLoading === quiz.id}
                    className="flex-1 btn-primary text-sm !px-3 !py-2.5"
                  >
                    {actionLoading === quiz.id ? '...' : '▶ Host Live'}
                  </button>
                  <Link
                    href={`/quiz/${quiz.id}/edit`}
                    className="btn-secondary text-sm !px-3 !py-2.5"
                  >
                    ✏️
                  </Link>
                  <button
                    onClick={() => handleDuplicate(quiz.id)}
                    disabled={actionLoading === quiz.id}
                    className="btn-secondary text-sm !px-3 !py-2.5"
                    title="Duplicate"
                  >
                    📋
                  </button>
                  <button
                    onClick={() => handleDelete(quiz.id)}
                    disabled={actionLoading === quiz.id}
                    className="btn-danger text-sm !px-3 !py-2.5"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
