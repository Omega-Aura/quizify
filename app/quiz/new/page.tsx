'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { QuizBuilder } from '@/components/QuizBuilder';

export default function NewQuizPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'HOST')) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) return null;

  return <QuizBuilder />;
}
