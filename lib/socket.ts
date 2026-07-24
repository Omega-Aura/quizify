import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

// Estimated (server clock - this device's clock), in ms. Countdown timers
// compare a server-issued timestamp against each device's own Date.now(), so
// without this, a device whose system clock is off shows a different
// remaining time than everyone else. Refreshed on every connect/reconnect
// and periodically, using a simple round-trip (NTP-style) estimate.
let clockOffsetMs = 0;

function syncClock(s: Socket) {
  s.emit('time:sync', Date.now());
}

/** Current time adjusted by the estimated offset from the server's clock. */
export function getServerNow(): number {
  return Date.now() + clockOffsetMs;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('time:sync:response', (data: { clientSentAt: number; serverTime: number }) => {
      const now = Date.now();
      const roundTripMs = now - data.clientSentAt;
      const estimatedServerNow = data.serverTime + roundTripMs / 2;
      clockOffsetMs = estimatedServerNow - now;
    });

    socket.on('connect', () => syncClock(socket!));
    // Correct for drift over a long-running session.
    setInterval(() => {
      if (socket?.connected) syncClock(socket);
    }, 30000);
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
