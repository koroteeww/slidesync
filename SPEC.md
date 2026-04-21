# SlideSync — Technical Specification (MVP v1.0)

> Open-source, self-hosted, non-profit alternative to AhaSlides.  
> Stack: **TypeScript · Node.js 20 · Express · EJS · JSON files (no database)**  
> Hosting: Single VDS (Ubuntu 22.04), nginx reverse proxy, PM2

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Constraints & Rules](#2-constraints--rules)
3. [Tech Stack](#3-tech-stack)
4. [Directory Structure](#4-directory-structure)
5. [Data Model](#5-data-model)
6. [API Routes](#6-api-routes)
7. [Validation Rules](#7-validation-rules)
8. [Session TTL & Cleanup](#8-session-ttl--cleanup)
9. [Concurrency & File Safety](#9-concurrency--file-safety)
10. [Frontend](#10-frontend)
11. [i18n (English + Russian)](#11-i18n-english--russian)
12. [Security](#12-security)
13. [Deployment](#13-deployment)
14. [Out of Scope for MVP](#14-out-of-scope-for-mvp)

---

## 1. Project Overview

SlideSync lets a **speaker** create interactive audience activities and share a link. Participants open the link with no login required and respond in real time. Results update every **500 ms** via HTTP polling.

Three activity types:
- **Quiz** — multiple choice, one correct answer, score shown after submit
- **Poll** — multiple choice, no correct answer, live bar chart
- **Word Cloud** — free-text input, live word cloud canvas

All session data is stored as JSON files on disk and **deleted 72 hours after the first participant response**. There is no database.

---

## 2. Constraints & Rules

| Subject | Rule |
|---|---|
| Speakers | Max **10** registered accounts total |
| Session types | Quiz, Poll, Word Cloud only |
| Questions (Quiz/Poll) | **1–10** questions per session |
| Options per question | **2–6** options |
| Word Cloud submissions | Max **500** per session |
| Word/phrase length | Max **100** characters |
| Session lifetime | Open until speaker manually closes it |
| Data retention | JSON file deleted **72h** after `firstUsedAt` is set |
| Participant auth | None — anonymous, link-only access |
| Duplicate submissions | One submission per `participantId` (UUID stored in browser `localStorage`) |

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5.x (strict mode) |
| Runtime | Node.js 20 LTS |
| Framework | Express 4.x |
| Templating | EJS (server-side rendered, no build step) |
| Auth | express-session + bcryptjs |
| Scheduling | node-cron (cleanup job) |
| Word cloud | wordcloud2.js (CDN, client-side canvas) |
| i18n | Custom lightweight helper (JSON locale files) |
| Process manager | PM2 |
| Reverse proxy | nginx |
| OS | Ubuntu 22.04 LTS |

### package.json dependencies

```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "connect-flash": "^0.1.1",
    "ejs": "^3.1.9",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "express-session": "^1.17.3",
    "node-cron": "^3.0.3",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/connect-flash": "^0.0.40",
    "@types/ejs": "^3.1.4",
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.17.10",
    "@types/node": "^20.11.0",
    "@types/node-cron": "^3.0.11",
    "@types/uuid": "^9.0.7",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.3"
  },
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/app.ts",
    "build": "tsc",
    "start": "node dist/app.js"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 4. Directory Structure

```
slidesync/
├── src/
│   ├── app.ts                      # Express entry point
│   ├── types.ts                    # All shared TypeScript interfaces
│   ├── routes/
│   │   ├── auth.ts                 # GET/POST /register, /login, /logout
│   │   ├── dashboard.ts            # Speaker dashboard (auth required)
│   │   ├── participate.ts          # Public participant routes
│   │   └── api.ts                  # GET /api/results/:id
│   ├── middleware/
│   │   ├── requireAuth.ts          # Redirect to /login if no session
│   │   └── i18n.ts                 # Inject res.locals.t() helper
│   ├── services/
│   │   ├── storage.ts              # Read/write JSON files with locking
│   │   ├── cleanup.ts              # node-cron 72h TTL job
│   │   └── sessionIdGen.ts         # Generate 8-char alphanumeric IDs
│   ├── views/
│   │   ├── layout/
│   │   │   └── base.ejs            # HTML shell, nav, lang switcher
│   │   ├── auth/
│   │   │   ├── login.ejs
│   │   │   └── register.ejs
│   │   ├── dashboard/
│   │   │   ├── index.ejs           # Session list
│   │   │   └── create.ejs          # Session creation form
│   │   ├── results/
│   │   │   └── index.ejs           # Speaker live results view
│   │   └── participate/
│   │       ├── quiz.ejs
│   │       ├── poll.ejs
│   │       └── wordcloud.ejs
│   └── locales/
│       ├── en.json
│       └── ru.json
├── public/
│   ├── css/
│   │   └── main.css
│   └── js/
│       └── app.js                  # Client-side polling + rendering
├── data/
│   ├── users.json                  # Speaker accounts
│   └── sessions/                   # One file per session
│       └── {sessionId}.json
├── .env
├── .env.example
├── .gitignore
├── tsconfig.json
└── package.json
```

---

## 5. Data Model

All types defined in `src/types.ts`.

### 5.1 User

```typescript
interface User {
  id: string;           // uuid v4
  email: string;        // lowercase, unique
  passwordHash: string; // bcrypt, 12 rounds
  createdAt: string;    // ISO 8601
}
```

Stored as `User[]` in `data/users.json`.  
**Hard limit: 10 users.** Registration returns HTTP 403 if limit is reached.

---

### 5.2 Session

```typescript
type SessionType   = 'quiz' | 'poll' | 'wordcloud';
type SessionStatus = 'open' | 'closed';

interface Session {
  id: string;                    // 8-char alphanumeric, uppercase
  speakerId: string;             // User.id
  type: SessionType;
  title: string;
  status: SessionStatus;
  createdAt: string;             // ISO 8601
  firstUsedAt: string | null;   // set on first participant POST
  config: QuizConfig | PollConfig | WordCloudConfig;
  responses: QuizResponse[] | PollResponse[] | WordCloudResponse[];
}
```

Stored as one file: `data/sessions/{id}.json`

---

### 5.3 Config types

```typescript
interface QuizQuestion {
  id: number;
  text: string;
  options: string[];   // 2–6 items
  correct: number;     // 0-based index
}

interface QuizConfig {
  questions: QuizQuestion[];  // 1–10 items
}

// Poll is identical to Quiz but without `correct`
interface PollQuestion {
  id: number;
  text: string;
  options: string[];
}

interface PollConfig {
  questions: PollQuestion[];
}

interface WordCloudConfig {
  prompt: string;
  maxSubmissions: 500;   // fixed constant
  maxChars: 100;         // fixed constant
}
```

---

### 5.4 Response types

```typescript
interface QuizResponse {
  participantId: string;               // uuid from browser localStorage
  answers: Record<number, number>;     // questionId -> option index
  submittedAt: string;
}

interface PollResponse {
  participantId: string;
  answers: Record<number, number>;
  submittedAt: string;
}

interface WordCloudResponse {
  participantId: string;
  word: string;                        // trimmed, max 100 chars
  submittedAt: string;
}
```

---

## 6. API Routes

### 6.1 Auth routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/register` | — | Show registration form |
| POST | `/register` | — | Create account. Validate uniqueness + cap. bcrypt hash. Save to users.json |
| GET | `/login` | — | Show login form |
| POST | `/login` | — | Validate credentials. Set session cookie |
| POST | `/logout` | required | Destroy session. Redirect to `/login` |

---

### 6.2 Dashboard routes (speaker, auth required)

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | List all sessions belonging to the logged-in speaker |
| GET | `/dashboard/create?type=quiz\|poll\|wordcloud` | Show creation form for chosen type |
| POST | `/dashboard/create` | Validate + save new session JSON. Redirect to results page |
| GET | `/dashboard/session/:id` | Live results view. Speaker must own this session |
| POST | `/dashboard/session/:id/close` | Set `status = 'closed'`. No more responses accepted |
| POST | `/dashboard/session/:id/delete` | Delete session JSON file immediately |

---

### 6.3 Participant routes (public, no auth)

| Method | Path | Description |
|---|---|---|
| GET | `/s/:id` | Render activity page. 404 if not found. 410 if closed |
| POST | `/s/:id/submit` | Accept response. Set `firstUsedAt` if null. Return `{ ok: true }` |

---

### 6.4 API routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/results/:id` | Return aggregated results JSON (see shapes below) |

#### Quiz results shape

```typescript
interface QuizResults {
  type: 'quiz';
  status: SessionStatus;
  title: string;
  totalResponses: number;
  questions: Array<{
    id: number;
    text: string;
    options: string[];
    correct: number;
    counts: number[];   // votes per option, same length as options
  }>;
}
```

#### Poll results shape

Same as `QuizResults` but without `correct` in each question.

#### Word Cloud results shape

```typescript
interface WordCloudResults {
  type: 'wordcloud';
  status: SessionStatus;
  title: string;
  totalResponses: number;
  words: Array<{
    text: string;
    count: number;
  }>;  // sorted by count descending
}
```

---

## 7. Validation Rules

### 7.1 Registration

- Email: valid format, max 254 chars, unique (case-insensitive), stored lowercase
- Password: min 8 chars, max 72 chars (bcrypt hard limit)
- User cap: if `users.json` has 10 entries → HTTP 403

### 7.2 Session creation

- `title`: required, 1–120 chars
- `type`: must be `quiz | poll | wordcloud`
- Quiz/Poll questions: 1–10
- Question text: 1–300 chars
- Options: 2–6, each 1–150 chars
- `correct` (quiz only): valid 0-based index within options
- Word Cloud prompt: 1–300 chars

### 7.3 Participant submission

- Session must be `open` → else HTTP 410
- `participantId` must be a valid UUID v4
- Duplicate `participantId` in responses → HTTP 409
- Word Cloud: `responses.length >= 500` → HTTP 429
- Word: trimmed, reject if empty or length > 100
- Quiz/Poll: all question IDs present, each answer is valid option index

---

## 8. Session TTL & Cleanup

File: `src/services/cleanup.ts`

```typescript
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { readSession } from './storage';

const TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const SESSIONS_DIR = path.join(process.env.DATA_DIR ?? './data', 'sessions');

export function startCleanupJob(): void {
  cron.schedule('0 * * * *', () => {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const session = readSession(file.replace('.json', ''));
      if (!session || !session.firstUsedAt) continue;

      const age = Date.now() - new Date(session.firstUsedAt).getTime();
      if (age > TTL_MS) {
        fs.unlinkSync(path.join(SESSIONS_DIR, file));
        console.log(`[cleanup] Deleted expired session ${file}`);
      }
    }
  });
}
```

Call `startCleanupJob()` once at app startup in `app.ts`.

Sessions with `firstUsedAt === null` (never used) are **never auto-deleted** — only the speaker can delete them manually.

---

## 9. Concurrency & File Safety

Node.js is single-threaded but async file I/O allows race conditions when multiple participants POST simultaneously. All read-modify-write operations on session files **must** use an in-process async lock.

File: `src/services/storage.ts`

```typescript
const locks: Record<string, boolean> = {};

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (locks[key]) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  locks[key] = true;
  try {
    return await fn();
  } finally {
    delete locks[key];
  }
}

// All submit handlers call:
// await withLock(sessionId, async () => { /* read → validate → write */ });
```

`users.json` writes also use `withLock('users', ...)`.

This is safe for a **single-process, single-server** deployment.

---

## 10. Frontend

### 10.1 Strategy

- Server-rendered EJS templates, no React/Vue/Angular
- No build step for templates
- `public/js/app.js` — small vanilla JS file for:
  - 500 ms polling on results/wordcloud pages
  - Submitting answers via `fetch()`
  - Rendering bar charts (CSS-only) and word cloud (wordcloud2.js on `<canvas>`)

### 10.2 500 ms polling

```javascript
// public/js/app.js
async function poll() {
  const res  = await fetch('/api/results/' + SESSION_ID);
  const data = await res.json();
  renderResults(data);
  if (data.status === 'open') setTimeout(poll, 500);
}
poll();
```

`SESSION_ID` is injected into the page by EJS: `<script>const SESSION_ID = '<%= session.id %>';</script>`

### 10.3 Word Cloud

Uses [wordcloud2.js](https://github.com/timdream/wordcloud2.js) loaded from CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/wordcloud@1.2.2/src/wordcloud2.js"></script>
<canvas id="wc" width="800" height="400"></canvas>
<script>
  function renderCloud(words) {
    WordCloud(document.getElementById('wc'), {
      list: words.map(w => [w.text, w.count]),
      gridSize: 8,
      weightFactor: 6,
      color: 'random-dark',
      backgroundColor: '#ffffff'
    });
  }
</script>
```

### 10.4 Participant ID

Generated once per browser, persisted in `localStorage`:

```javascript
// public/js/app.js
function getParticipantId() {
  let id = localStorage.getItem('slidesync_pid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('slidesync_pid', id);
  }
  return id;
}
```

---

## 11. i18n (English + Russian)

Middleware injects `res.locals.t` into every request.

```typescript
// src/middleware/i18n.ts
import en from '../locales/en.json';
import ru from '../locales/ru.json';

const locales: Record<string, Record<string, string>> = { en, ru };

export function i18nMiddleware(req, res, next) {
  const lang = (req.cookies?.lang ?? req.query.lang ?? 'en') as string;
  const locale = locales[lang] ?? locales['en'];
  res.locals.t = (key: string) => locale[key] ?? key;
  res.locals.lang = lang;
  next();
}
```

Language switched via `?lang=en` or `?lang=ru` query param. Value saved in cookie `lang`.

In EJS templates:
```ejs
<h1><%= t('dashboard.title') %></h1>
<button><%= t('session.close') %></button>
```

---

## 12. Security

| Concern | Solution |
|---|---|
| Passwords | bcrypt, 12 salt rounds. Never logged or stored in plaintext |
| Session cookie | `httpOnly: true`, `sameSite: 'strict'`, strong random `SESSION_SECRET` in `.env` |
| CSRF | `sameSite: 'strict'` provides sufficient protection for MVP same-origin forms |
| XSS | EJS `<%= %>` HTML-escapes all output by default. Never use `<%- %>` for user input |
| Path traversal | `sessionId` validated against `/^[A-Z0-9]{8}$/` before building file path |
| Rate limiting | `/login`: 10 attempts per 15 min per IP. `/s/:id/submit`: 30 req/min per IP |
| Secrets | `.env` in `.gitignore`. `.env.example` committed with placeholder values |

### .env.example

```
PORT=3000
SESSION_SECRET=replace_with_64_char_random_string
DATA_DIR=./data
DEFAULT_LANG=en
```

---

## 13. Deployment

See `DEPLOY.md` for full step-by-step VDS setup.

Summary:
1. Ubuntu 22.04, install Node 20 via nvm
2. Clone repo, `npm install`, `npm run build`
3. Start with PM2: `pm2 start dist/app.js --name slidesync`
4. nginx reverse proxy on port 80/443
5. certbot for HTTPS
6. DNS: A record pointing subdomain to server IP

---

## 14. Out of Scope for MVP

- Email verification or password reset
- Session editing after creation (delete + recreate)
- Multiple correct answers per quiz question
- Participant nicknames or leaderboards
- Data export (CSV, PDF)
- Admin panel
- Dark mode
- WebSockets / Server-Sent Events
- Docker / containerisation
- Rate limiting per session (only per IP for MVP)
