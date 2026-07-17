import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Quizify — Interactive Live Quiz Platform',
  description:
    'Create and host live quizzes with real-time scoring and leaderboards. Engage your audience with interactive, gamified learning experiences.',
  keywords: ['quiz', 'kahoot', 'live quiz', 'interactive', 'gamified learning', 'leaderboard'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} bg-mesh`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
