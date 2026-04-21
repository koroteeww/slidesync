import fs from 'fs';
import path from 'path';
import { User, Session } from '../types';

const DATA_DIR = process.env.DATA_DIR ?? './data';
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_ID_REGEX = /^[A-Z0-9]{8}$/;

// In-process locks for file safety
const locks: Record<string, boolean> = {};

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
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

export function readUsers(): User[] {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data) as User[];
  } catch (error) {
    console.error('Error reading users:', error);
    return [];
  }
}

export function listSessionsForSpeaker(speakerId: string): Session[] {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    const sessions: Session[] = [];

    for (const file of files) {
      const session = readSession(file.replace('.json', ''));
      if (session && session.speakerId === speakerId) {
        sessions.push(session);
      }
    }

    return sessions;
  } catch (error) {
    console.error('Error listing sessions for speaker:', error);
    return [];
  }
}

export function readSession(id: string): Session | null {
  if (!SESSION_ID_REGEX.test(id)) {
    return null;
  }

  try {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as Session;
  } catch (error) {
    console.error(`Error reading session ${id}:`, error);
    return null;
  }
}

export function writeSession(session: Session): void {
  if (!SESSION_ID_REGEX.test(session.id)) {
    throw new Error(`Invalid session ID: ${session.id}`);
  }

  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  } catch (error) {
    console.error(`Error writing session ${session.id}:`, error);
    throw error;
  }
}

export function deleteSession(id: string): void {
  if (!SESSION_ID_REGEX.test(id)) {
    return;
  }

  try {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Error deleting session ${id}:`, error);
    throw error;
  }
}

export function listSessionsForSpeaker(speakerId: string): Session[] {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(SESSIONS_DIR).filter((f: string) => f.endsWith('.json'));
    const sessions: Session[] = [];

    for (const file of files) {
      const sessionId = file.replace('.json', '');
      if (SESSION_ID_REGEX.test(sessionId)) {
        const session = readSession(sessionId);
        if (session && session.speakerId === speakerId) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  } catch (error) {
    console.error('Error listing sessions for speaker:', error);
    return [];
  }
}