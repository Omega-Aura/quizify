'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';

interface Player {
  id: string;
  nickname: string;
  totalScore: number;
}

export default function JoinPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pin = searchParams.get('pin') || '';
  const sessionId = params.sessionId;

  const [nickname, setNickname] = useState('');
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleJoin = useCallback(() => {
    if (!nickname.trim()) {
      setError('Enter a nickname');
      return;
    }
    if (nickname.length > 20) {
      setError('Nickname must be 20 characters or less');
      return;
    }

    setConnecting(true);
    setError('');

    const socket = connectSocket();
    const token = typeof window !== 'undefined' ? localStorage.getItem('quizify_token') : null;

    socket.emit('player:join', { pin, nickname: nickname.trim(), token });
  }, [nickname, pin]);

  useEffect(() => {
    const socket = getSocket();

    const onJoined = (data: { playerId: string; sessionId: string; nickname: string }) => {
      setPlayerId(data.playerId);
      setJoined(true);
      setConnecting(false);
      // Store playerId, pin, and nickname for the play page (needed for socket re-join)
      sessionStorage.setItem(`player_${sessionId}`, data.playerId);
      sessionStorage.setItem(`pin_${sessionId}`, pin);
      sessionStorage.setItem(`nickname_${sessionId}`, data.nickname);
    };

    const onLobbyUpdate = (data: { players: Player[] }) => {
      setPlayers(data.players);
    };

    const onQuestionShow = (data: any) => {
      // Store the first question data so the play page can pick it up
      // (this event won't fire again for the first question)
      sessionStorage.setItem(`pending_question_${sessionId}`, JSON.stringify(data));
      router.push(`/play/${sessionId}`);
    };

    const onError = (data: { message: string }) => {
      setError(data.message);
      setConnecting(false);
    };

    socket.on('player:joined', onJoined);
    socket.on('lobby:update', onLobbyUpdate);
    socket.on('question:show', onQuestionShow);
    socket.on('error', onError);

    return () => {
      socket.off('player:joined', onJoined);
      socket.off('lobby:update', onLobbyUpdate);
      socket.off('question:show', onQuestionShow);
      socket.off('error', onError);
    };
  }, [router, sessionId]);

  // Cleanup socket on unmount (only if not navigating to play)
  useEffect(() => {
    return () => {
      // Don't disconnect — we need the socket for the play page
    };
  }, []);

  const avatarColors = [
    'from-answer-red to-pink-600',
    'from-answer-blue to-cyan-600',
    'from-answer-yellow to-orange-500',
    'from-answer-green to-emerald-600',
    'from-brand-500 to-purple-600',
    'from-pink-500 to-rose-600',
    'from-cyan-500 to-blue-600',
    'from-orange-500 to-amber-600',
  ];

  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-600/20 border border-brand-500/30 text-brand-300 text-sm mb-6">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Game PIN: {pin}
            </div>
            <h1 className="text-3xl font-bold mb-2">You&apos;re in!</h1>
            <p className="text-white/40">Choose a nickname to join</p>
          </div>

          <div className="animate-slide-up space-y-4">
            <input
              type="text"
              value={nickname}
              onChange={(e) => { setNickname(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Your nickname"
              className="input-field text-center text-xl !py-4"
              maxLength={20}
              autoFocus
              aria-label="Nickname"
            />

            {error && (
              <p className="text-red-400 text-sm animate-fade-in" role="alert">{error}</p>
            )}

            <button
              onClick={handleJoin}
              disabled={!nickname.trim() || connecting}
              className="btn-primary w-full !py-4 text-lg"
            >
              {connecting ? 'Joining...' : "Let's go!"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-lg w-full">
        {/* Status */}
        <div className="mb-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 text-sm mb-4">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Connected • PIN: {pin}
          </div>
          <h1 className="text-3xl font-bold mb-2">Waiting for host...</h1>
          <p className="text-white/40">
            You joined as <span className="text-brand-300 font-medium">{nickname}</span>
          </p>
        </div>

        {/* Players grid */}
        <div className="glass-card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white/50">Players in lobby</h2>
            <span className="text-sm font-bold text-brand-400">{players.length}</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[40vh] overflow-y-auto">
            {players.map((player, i) => (
              <div
                key={player.id}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[0.03] animate-bounce-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center font-bold text-sm`}>
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <span className={`text-xs truncate w-full text-center ${player.id === playerId ? 'text-brand-300 font-bold' : 'text-white/70'}`}>
                  {player.nickname}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Waiting animation */}
        <div className="mt-8 flex items-center justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
