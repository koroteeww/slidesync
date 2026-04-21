import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { i18nMiddleware } from './middleware/i18n';
import { requireAuth } from './middleware/requireAuth';
import { startCleanupJob } from './services/cleanup';
import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import participateRouter from './routes/participate';
import apiRouter from './routes/api';

const app = express();

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Static files
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
  },
}));

// Flash messages
app.use(require('connect-flash')());

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per windowMs
  message: 'Too many login attempts, please try again later.',
});

const submitLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per windowMs
  message: 'Too many submissions, please try again later.',
});

// Apply rate limiters
app.use('/login', loginLimiter);
app.use('/s/:id/submit', submitLimiter);

// i18n middleware
app.use(i18nMiddleware);

// Mount routers
app.use('/', authRouter);
app.use('/dashboard', requireAuth, dashboardRouter);
app.use('/s', participateRouter);
app.use('/api', apiRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).render('404', { title: '404' });
});

// 500 error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).render('500', { title: 'Error' });
});

// Start cleanup job
startCleanupJob();

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});