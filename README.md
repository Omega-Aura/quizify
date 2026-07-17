# Quizify — Interactive Live Quiz Platform

A real-time Kahoot-style quiz platform built with Next.js, HonoJS, Socket.io, and PostgreSQL.

## Features

- **Host/Admin**: Create quizzes with a three-zone builder, run live sessions, view results
- **Participant**: Join via 6-digit PIN, answer questions in real time, compete on leaderboards
- **Real-time sync**: Socket.io WebSockets keep all players synchronized
- **Speed-based scoring**: Faster correct answers earn more points
- **CSV export**: Download full session results

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS
- **Backend**: Node.js, HonoJS (REST API)
- **Real-time**: Socket.io (WebSockets)
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: JWT with bcrypt password hashing

## Prerequisites

- Node.js 18+
- PostgreSQL (or Docker)

## Quick Start

### 1. Clone & install

```bash
cd Quizify
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work with Docker)
```

### 3. Start PostgreSQL

```bash
docker-compose up -d
```

Or point `DATABASE_URL` in `.env` to your existing PostgreSQL instance.

### 4. Set up database

```bash
npx prisma migrate dev --name init
```

### 5. Start development

```bash
npm run dev
```

This starts:
- **Next.js** on [http://localhost:3000](http://localhost:3000)
- **API + Socket.io** on [http://localhost:3001](http://localhost:3001)

## Creating a Host Account

Anyone can join a quiz as a participant. To create a **host** account (which can
build quizzes and run live sessions), set `HOST_SIGNUP_KEY` to a secret value and
enter that key on the sign-up page. If `HOST_SIGNUP_KEY` is not set, host signup is
disabled.

## Environment Variables

| Variable               | Description                                    | Default                                        |
|------------------------|------------------------------------------------|------------------------------------------------|
| `POSTGRES_DB`          | Docker Compose Postgres database name          | `quizify`                                      |
| `POSTGRES_USER`        | Docker Compose Postgres user                   | `quizify`                                      |
| `POSTGRES_PASSWORD`    | Docker Compose Postgres password — set your own | _(required, no default — see `.env.example`)_ |
| `DATABASE_URL`         | PostgreSQL connection string (must match the `POSTGRES_*` values and port `5433`) | `postgresql://quizify:<your-password>@localhost:5433/quizify` |
| `JWT_SECRET`           | JWT signing secret                             | `dev-secret-change-me`                         |
| `HOST_SIGNUP_KEY`      | Secret required to sign up as a host           | _(unset — host signup disabled)_               |
| `PORT`                 | API server port                                | `3001`                                         |
| `NEXT_PUBLIC_API_URL`  | API URL for frontend                           | `http://localhost:3001`                        |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io URL for frontend                   | `http://localhost:3001`                        |

## Project Structure

```
Quizify/
├── app/                    # Next.js pages (App Router)
│   ├── page.tsx            # Participant home (enter PIN)
│   ├── login/              # Auth
│   ├── signup/
│   ├── dashboard/          # Host quiz management
│   ├── quiz/new/           # Quiz builder
│   ├── quiz/[id]/edit/     # Quiz editor
│   ├── join/[sessionId]/   # Player lobby
│   ├── play/[sessionId]/   # Live quiz play
│   ├── result/[sessionId]/ # Player results
│   └── host/[sessionId]/   # Host control + results
├── server/                 # HonoJS API + Socket.io
│   ├── index.ts            # Server entry point
│   ├── routes/             # REST API routes
│   ├── socket/             # Socket.io event handlers
│   ├── middleware/         # Auth middleware
│   └── lib/               # Utilities (Prisma, scoring)
├── lib/                    # Frontend utilities
├── prisma/                 # Schema + migrations
└── docker-compose.yml      # PostgreSQL
```

## Scoring Formula

```
score = round(1000 × (1 - (responseMs / timeLimitMs) / 2))
```

- Fastest correct answer: 1000 points
- Slowest correct answer: 500 points
- Incorrect: 0 points
- Multiplied by points mode (1x, 2x, or 0)

## License

MIT
