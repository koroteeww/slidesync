import express, { Request, Response } from 'express';
import { validate as uuidValidate } from 'uuid';
import { readSession, writeSession, withLock } from '../services/storage';
import { QuizResponse, PollResponse, WordCloudResponse } from '../types';

const router = express.Router();

// GET /s/:id
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  // Validate session ID format
  if (!/^[A-Z0-9]{8}$/.test(id)) {
    return res.status(404).render('404');
  }

  const session = readSession(id);
  if (!session) {
    return res.status(404).render('404');
  }

  if (session.status === 'closed') {
    return res.status(410).render('410', { message: 'This session is closed' });
  }

  // Render appropriate template
  res.render(`participate/${session.type}`, { session });
});

// POST /s/:id/submit
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { participantId, answers, word } = req.body;

    // Validate session ID format
    if (!/^[A-Z0-9]{8}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid session ID' });
    }

    const session = readSession(id);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    // Check if session is open
    if (session.status !== 'open') {
      return res.status(410).json({ ok: false, error: 'Session is closed' });
    }

    // Validate participantId
    if (!participantId || typeof participantId !== 'string' || !uuidValidate(participantId)) {
      return res.status(400).json({ ok: false, error: 'Invalid participant ID' });
    }

    // Check for duplicate participantId
    const existingResponse = session.responses.find(r => r.participantId === participantId);
    if (existingResponse) {
      return res.status(409).json({ ok: false, error: 'Already submitted' });
    }

    let response: QuizResponse | PollResponse | WordCloudResponse;

    if (session.type === 'wordcloud') {
      // Validate word cloud submission
      if (session.responses.length >= 500) {
        return res.status(429).json({ ok: false, error: 'Submission limit reached' });
      }

      if (!word || typeof word !== 'string') {
        return res.status(400).json({ ok: false, error: 'Word is required' });
      }

      const trimmedWord = word.trim();
      if (trimmedWord.length === 0 || trimmedWord.length > 100) {
        return res.status(400).json({ ok: false, error: 'Word must be 1-100 characters' });
      }

      response = {
        participantId,
        word: trimmedWord,
        submittedAt: new Date().toISOString(),
      };
    } else {
      // Validate quiz/poll answers
      if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ ok: false, error: 'Answers are required' });
      }

      const config = session.config;
      if (!config || !('questions' in config)) {
        return res.status(500).json({ ok: false, error: 'Invalid session configuration' });
      }

      // Check all questions are answered
      for (const question of config.questions) {
        if (!(question.id in answers)) {
          return res.status(400).json({ ok: false, error: `Answer for question ${question.id} is required` });
        }

        const answerIndex = answers[question.id];
        if (typeof answerIndex !== 'number' || answerIndex < 0 || answerIndex >= question.options.length) {
          return res.status(400).json({ ok: false, error: `Invalid answer for question ${question.id}` });
        }
      }

      response = {
        participantId,
        answers,
        submittedAt: new Date().toISOString(),
      };
    }

    // Set firstUsedAt if null
    if (session.firstUsedAt === null) {
      session.firstUsedAt = new Date().toISOString();
    }

    // Add response
    session.responses.push(response);

    // Write session with lock
    await withLock(id, async () => {
      writeSession(session);
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

export default router;