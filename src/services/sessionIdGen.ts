import crypto from 'crypto';
import path from 'path';
import { readSession } from './storage';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateSessionId(): string {
  while (true) {
    // Generate 8 random bytes
    const bytes = crypto.randomBytes(8);

    // Convert to 8-character string using A-Z0-9
    let id = '';
    for (let i = 0; i < 8; i++) {
      const index = bytes[i] % 36;
      id += CHARS[index];
    }

    // Check if session already exists
    if (readSession(id) === null) {
      return id;
    }

    // Collision detected, try again (extremely unlikely)
  }
}