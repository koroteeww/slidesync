import express, { Request, Response } from 'express';
import { readSession } from '../services/storage';
import { QuizResults, PollResults, WordCloudResults } from '../types';

const router = express.Router();

// GET /api/results/:id
router.get('/results/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  // Validate session ID format
  if (!/^[A-Z0-9]{8}$/.test(id)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = readSession(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const totalResponses = session.responses.length;

  if (session.type === 'wordcloud') {
    // Aggregate word cloud results - preserve original casing of first occurrence
    const wordMap: Record<string, { text: string; count: number }> = {};
    session.responses.forEach(response => {
      if ('word' in response) {
        const lower = response.word.toLowerCase();
        if (!wordMap[lower]) {
          wordMap[lower] = { text: response.word, count: 0 };
        }
        wordMap[lower].count++;
      }
    });

    const words = Object.values(wordMap).sort((a, b) => b.count - a.count);

    const results: WordCloudResults = {
      type: 'wordcloud',
      status: session.status,
      title: session.title,
      totalResponses,
      words,
    };

    res.json(results);
  } else {
    // Aggregate quiz/poll results
    const config = session.config;
    if (!config || !('questions' in config)) {
      return res.status(500).json({ error: 'Invalid session configuration' });
    }

    const questions = config.questions.map(question => {
      const counts = new Array(question.options.length).fill(0);

      session.responses.forEach(response => {
        if ('answers' in response && question.id in response.answers) {
          const answerIndex = response.answers[question.id];
          if (answerIndex >= 0 && answerIndex < counts.length) {
            counts[answerIndex]++;
          }
        }
      });

      if (session.type === 'quiz') {
        return {
          id: question.id,
          text: question.text,
          options: question.options,
          correct: ('correct' in question) ? question.correct : 0,
          counts,
        };
      } else {
        return {
          id: question.id,
          text: question.text,
          options: question.options,
          counts,
        };
      }
    });

    if (session.type === 'quiz') {
      const results: QuizResults = {
        type: 'quiz',
        status: session.status,
        title: session.title,
        totalResponses,
        questions: questions as QuizResults['questions'],
      };
      res.json(results);
    } else {
      const results: PollResults = {
        type: 'poll',
        status: session.status,
        title: session.title,
        totalResponses,
        questions: questions as PollResults['questions'],
      };
      res.json(results);
    }
  }
});

export default router;