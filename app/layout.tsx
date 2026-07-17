import type { Metadata } from 'next';
import { Inter, Fraunces, IBM_Plex_Mono } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { NeuralField } from '@/components/NeuralField';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '900'],
  style: ['normal', 'italic'],
  variable: '--font-display',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Quizify — Live Quizzes, Wired for the Brain',
  description:
    'Host live quizzes built around how people actually learn. Real-time scoring, leaderboards, and a game your audience remembers.',
  keywords: ['quiz', 'live quiz', 'interactive', 'learning', 'leaderboard', 'brain'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${plexMono.variable}`}>
      <body className={inter.className}>
        {/* Global neuron field, faint, behind everything */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <NeuralField className="absolute inset-0 h-full w-full" intensity={0.5} />
        </div>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
