import express, { Request, Response } from 'express';
import { readSession, writeSession, deleteSession, listSessionsForSpeaker, withLock } from '../services/storage';
import { generateSessionId } from '../services/sessionIdGen';
import { Session, SessionType, QuizConfig, PollConfig, WordCloudConfig, QuizQuestion, PollQuestion } from '../types';

const router = express.Router();

// GET /dashboard
router.get('/', (req: Request, res: Response) => {
  const speakerId = req.session.userId!;
  const sessions = listSessionsForSpeaker(speakerId);

  // Sort by createdAt descending
  sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.render('dashboard/index', { sessions });
});

// GET /dashboard/create
router.get('/create', (req: Request, res: Response) => {
  const { type } = req.query;

  if (!type || typeof type !== 'string' || !['quiz', 'poll', 'wordcloud'].includes(type)) {
    req.flash('error', 'Invalid session type');
    return res.redirect('/dashboard');
  }

  res.render('dashboard/create', { type });
});

// POST /dashboard/create
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { type, title, questions, prompt } = req.body;
    const speakerId = req.session.userId!;

    // Validate type
    if (!['quiz', 'poll', 'wordcloud'].includes(type)) {
      req.flash('error', 'Invalid session type');
      return res.redirect('/dashboard');
    }

    // Validate title
    if (!title || typeof title !== 'string' || title.length < 1 || title.length > 120) {
      req.flash('error', 'Title must be 1-120 characters');
      return res.redirect(`/dashboard/create?type=${type}`);
    }

    let config: QuizConfig | PollConfig | WordCloudConfig;

    if (type === 'wordcloud') {
      // Validate wordcloud prompt
      if (!prompt || typeof prompt !== 'string' || prompt.length < 1 || prompt.length > 300) {
        req.flash('error', 'Prompt must be 1-300 characters');
        return res.redirect('/dashboard/create?type=wordcloud');
      }

      config = {
        prompt,
        maxSubmissions: 500,
        maxChars: 100,
      };
    } else {
      // Validate quiz/poll questions
      if (!Array.isArray(questions) || questions.length < 1 || questions.length > 10) {
        req.flash('error', 'Must have 1-10 questions');
        return res.redirect(`/dashboard/create?type=${type}`);
      }

      if (type === 'quiz') {
        const quizQuestions: QuizQuestion[] = [];

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];

          if (!q.text || typeof q.text !== 'string' || q.text.length < 1 || q.text.length > 300) {
            req.flash('error', `Question ${i + 1}: text must be 1-300 characters`);
            return res.redirect('/dashboard/create?type=quiz');
          }

          if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
            req.flash('error', `Question ${i + 1}: must have 2-6 options`);
            return res.redirect('/dashboard/create?type=quiz');
          }

          for (let j = 0; j < q.options.length; j++) {
            if (!q.options[j] || typeof q.options[j] !== 'string' || q.options[j].length < 1 || q.options[j].length > 150) {
              req.flash('error', `Question ${i + 1}, option ${j + 1}: must be 1-150 characters`);
              return res.redirect('/dashboard/create?type=quiz');
            }
          }

          if (typeof q.correct !== 'number' || q.correct < 0 || q.correct >= q.options.length) {
            req.flash('error', `Question ${i + 1}: invalid correct answer index`);
            return res.redirect('/dashboard/create?type=quiz');
          }

          quizQuestions.push({
            id: i,
            text: q.text,
            options: q.options,
            correct: q.correct,
          });
        }

        config = { questions: quizQuestions };
      } else {
        // poll
        const pollQuestions: PollQuestion[] = [];

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];

          if (!q.text || typeof q.text !== 'string' || q.text.length < 1 || q.text.length > 300) {
            req.flash('error', `Question ${i + 1}: text must be 1-300 characters`);
            return res.redirect('/dashboard/create?type=poll');
          }

          if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
            req.flash('error', `Question ${i + 1}: must have 2-6 options`);
            return res.redirect('/dashboard/create?type=poll');
          }

          for (let j = 0; j < q.options.length; j++) {
            if (!q.options[j] || typeof q.options[j] !== 'string' || q.options[j].length < 1 || q.options[j].length > 150) {
              req.flash('error', `Question ${i + 1}, option ${j + 1}: must be 1-150 characters`);
              return res.redirect('/dashboard/create?type=poll');
            }
          }

          pollQuestions.push({
            id: i,
            text: q.text,
            options: q.options,
          });
        }

        config = { questions: pollQuestions };
      }
    }

    // Generate session ID
    const sessionId = generateSessionId();

    // Create session
    const session: Session = {
      id: sessionId,
      speakerId,
      type: type as SessionType,
      title,
      status: 'open',
      createdAt: new Date().toISOString(),
      firstUsedAt: null,
      config,
      responses: [],
    };

    // Write session
    await withLock(sessionId, async () => {
      writeSession(session);
    });

    // Redirect to results
    res.redirect(`/dashboard/session/${sessionId}`);
  } catch (error) {
    console.error('Session creation error:', error);
    req.flash('error', 'Server error');
    res.redirect('/dashboard');
  }
});

// GET /dashboard/session/:id
router.get('/session/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const speakerId = req.session.userId!;

  // Validate session ID format
  if (!/^[A-Z0-9]{8}$/.test(id)) {
    return res.status(404).render('404');
  }

  const session = readSession(id);
  if (!session) {
    return res.status(404).render('404');
  }

  if (session.speakerId !== speakerId) {
    return res.status(403).render('404'); // Don't reveal existence
  }

  res.render('results/index', { session });
});

// POST /dashboard/session/:id/close
router.post('/session/:id/close', async (req: Request, res: Response) => {
  const { id } = req.params;
  const speakerId = req.session.userId!;

  // Validate session ID format
  if (!/^[A-Z0-9]{8}$/.test(id)) {
    return res.status(404).render('404');
  }

  const session = readSession(id);
  if (!session) {
    return res.status(404).render('404');
  }

  if (session.speakerId !== speakerId) {
    return res.status(403).render('404');
  }

  // Update status
  session.status = 'closed';

  await withLock(id, async () => {
    writeSession(session);
  });

  res.redirect(`/dashboard/session/${id}`);
});

// POST /dashboard/session/:id/delete
router.post('/session/:id/delete', (req: Request, res: Response) => {
  const { id } = req.params;
  const speakerId = req.session.userId!;

  // Validate session ID format
  if (!/^[A-Z0-9]{8}$/.test(id)) {
    return res.status(404).render('404');
  }

  const session = readSession(id);
  if (!session) {
    return res.status(404).render('404');
  }

  if (session.speakerId !== speakerId) {
    return res.status(403).render('404');
  }

  deleteSession(id);
  res.redirect('/dashboard');
});

export default router;