# SlideSync AI Coding Guidelines

## Architecture Overview
SlideSync is a Node.js/Express application for interactive presentations with three activity types (quiz, poll, wordcloud). It uses JSON file storage instead of a database, with sessions stored in `data/sessions/{id}.json` and users in `data/users.json`. Real-time updates occur via 500ms HTTP polling. Sessions auto-delete 72 hours after first participant response.

## Key Components
- **Entry Point**: `src/app.ts` - Express setup with middleware
- **Types**: `src/types.ts` - All interfaces (User, Session, configs, responses)
- **Storage**: `src/services/storage.ts` - File I/O with async locking via `withLock()`
- **Cleanup**: `src/services/cleanup.ts` - node-cron job for TTL enforcement
- **Views**: `src/views/` - EJS templates with i18n via `<%= t('key') %>`
- **Client**: `public/js/app.js` - Polling, submissions, wordcloud2.js integration

## Development Workflow
- **Dev Server**: `npm run dev` (ts-node-dev with auto-restart)
- **Build**: `npm run build` (TypeScript to `dist/`)
- **Production**: `npm start` (PM2 recommended)
- **Data Directory**: Set via `DATA_DIR` env var (defaults to `./data`)

## Patterns & Conventions
- **Session IDs**: 8-character alphanumeric uppercase (e.g., `ABC123DE`)
- **Participant IDs**: UUID v4 stored in browser localStorage
- **File Locking**: Use `withLock(sessionId, async () => { ... })` for all read-modify-write operations
- **Validation**: Strict limits (10 users max, 1-10 questions, 2-6 options, 500 wordcloud submissions)
- **i18n**: Languages in `src/locales/en.json`/`ru.json`, middleware injects `res.locals.t()`
- **Error Handling**: HTTP status codes (403 for user cap, 409 for duplicate submissions, 410 for closed sessions)
- **Security**: bcrypt passwords, httpOnly session cookies, rate limiting on auth/submit routes

## Code Examples
- **Creating Session**: POST to `/dashboard/create` with `type`, `title`, and type-specific config
- **Submitting Response**: POST `/s/:id/submit` with `participantId` and activity-specific data
- **Polling Results**: GET `/api/results/:id` returns aggregated data for rendering
- **Word Cloud Rendering**: Use wordcloud2.js with `list: words.map(w => [w.text, w.count])`

## Deployment Notes
Single-server deployment with nginx reverse proxy. No database required. Sessions never auto-delete if unused (only speaker deletion).