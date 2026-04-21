// User types
export interface User {
  id: string;           // uuid v4
  email: string;        // lowercase, unique
  passwordHash: string; // bcrypt, 12 rounds
  createdAt: string;    // ISO 8601
}

// Session types
export type SessionType = 'quiz' | 'poll' | 'wordcloud';
export type SessionStatus = 'open' | 'closed';

export interface Session {
  id: string;                    // 8-char alphanumeric, uppercase
  speakerId: string;             // User.id
  type: SessionType;
  title: string;
  status: SessionStatus;
  createdAt: string;             // ISO 8601
  firstUsedAt: string | null;   // set on first participant POST
  config: QuizConfig | PollConfig | WordCloudConfig;
  responses: (QuizResponse | PollResponse | WordCloudResponse)[];
}

// Config types
export interface QuizQuestion {
  id: number;
  text: string;
  options: string[];   // 2–6 items
  correct: number;     // 0-based index
}

export interface QuizConfig {
  questions: QuizQuestion[];  // 1–10 items
}

export interface PollQuestion {
  id: number;
  text: string;
  options: string[];
}

export interface PollConfig {
  questions: PollQuestion[];
}

export interface WordCloudConfig {
  prompt: string;
  maxSubmissions: number;   // fixed constant 500
  maxChars: number;         // fixed constant 100
}

// Response types
export interface QuizResponse {
  participantId: string;               // uuid from browser localStorage
  answers: Record<number, number>;     // questionId -> option index
  submittedAt: string;
}

export interface PollResponse {
  participantId: string;
  answers: Record<number, number>;
  submittedAt: string;
}

export interface WordCloudResponse {
  participantId: string;
  word: string;                        // trimmed, max 100 chars
  submittedAt: string;
}

// Results types
export interface QuizResults {
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

export interface PollResults {
  type: 'poll';
  status: SessionStatus;
  title: string;
  totalResponses: number;
  questions: Array<{
    id: number;
    text: string;
    options: string[];
    counts: number[];
  }>;
}

export interface WordCloudResults {
  type: 'wordcloud';
  status: SessionStatus;
  title: string;
  totalResponses: number;
  words: Array<{
    text: string;
    count: number;
  }>;  // sorted by count descending
}