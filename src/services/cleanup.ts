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