'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { QuizBuilder } from '../../new/page';

interface QuizData {
  id: string;
  title: string;
  description: string | null;
  questions: {
    prompt: string;
    mediaUrl: string | null;
    type: 'QUIZ' | 'TRUE_FALSE';
    timeLimit: number;
    pointsMode: 'STANDARD' | 'DOUBLE' | 'NONE';
    singleSelect: boolean;
    answers: {
      text: string;
      imageUrl: string | null;
      isCorrect: boolean;
    }[];
  }[];
}

export default function EditQuizPage({ params }: { params: { id: string } }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'HOST')) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role === 'HOST') {
      api
        .get<{ quiz: QuizData }>(`/api/quiz/${params.id}`)
        .then((data) => setQuiz(data.quiz))
        .catch(() => router.push('/dashboard'))
        .finally(() => setLoading(false));
    }
  }, [user, params.id, router]);

  if (authLoading || loading || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/50">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading quiz...
        </div>
      </div>
    );
  }

  return (
    <QuizBuilder
      quizId={quiz.id}
      initialTitle={quiz.title}
      initialDescription={quiz.description || ''}
      initialQuestions={quiz.questions.map((q) => ({
        prompt: q.prompt,
        mediaUrl: q.mediaUrl,
        type: q.type,
        timeLimit: q.timeLimit,
        pointsMode: q.pointsMode,
        singleSelect: q.singleSelect,
        answers: q.answers.map((a) => ({
          text: a.text,
          imageUrl: a.imageUrl,
          isCorrect: a.isCorrect,
        })),
      }))}
    />
  );
}
