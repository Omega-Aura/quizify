import { createServer } from 'node:http';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Server as SocketIOServer } from 'socket.io';
import { getRequestListener } from '@hono/node-server';
import { config } from 'dotenv';

import { authRoutes } from './routes/auth';
import { quizRoutes } from './routes/quiz';
import { sessionRoutes } from './routes/session';
import { setupSocket } from './socket/handlers';

// ─── Load environment ────────────────────────────────────────────────
config();

const PORT = parseInt(process.env.PORT || '3001', 10);

// Allowed browser origins for CORS. In production set FRONTEND_URL to your
// deployed web URL (comma-separate multiple origins). Localhost stays allowed
// for local dev.
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((o) => o.trim()).filter(Boolean)
    : []),
];

// ─── Hono app ────────────────────────────────────────────────────────
const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// ─── API routes ──────────────────────────────────────────────────────
app.route('/api/auth', authRoutes);
app.route('/api/quiz', quizRoutes);
app.route('/api/session', sessionRoutes);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── HTTP server + Socket.io ─────────────────────────────────────────
const requestListener = getRequestListener(app.fetch);
const server = createServer(requestListener);

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

setupSocket(io);

// ─── Start server ────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log(`  ║  🚀 Quizify API running on port ${PORT}      ║`);
  console.log('  ║  📡 Socket.io ready                      ║');
  console.log(`  ║  🔗 http://localhost:${PORT}                ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});
