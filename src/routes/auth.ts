import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { readUsers, writeUsers, withLock } from '../services/storage';
import { User } from '../types';

const router = express.Router();

// Email validation regex (basic)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /register
router.get('/register', (req: Request, res: Response) => {
  res.render('auth/register');
});

// POST /register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return res.status(400).render('auth/register', { error: 'Email is required' });
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0 || trimmedEmail.length > 254) {
      return res.status(400).render('auth/register', { error: 'Email must be 1-254 characters' });
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).render('auth/register', { error: 'Invalid email format' });
    }

    // Validate password
    if (!password || typeof password !== 'string') {
      return res.status(400).render('auth/register', { error: 'Password is required' });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).render('auth/register', { error: 'Password must be 8-72 characters' });
    }

    // Check user cap and uniqueness
    await withLock('users', async () => {
      const users = readUsers();

      // Check user cap
      if (users.length >= 10) {
        return res.status(403).render('auth/register', { error: 'User limit reached (10 users maximum)' });
      }

      // Check uniqueness (case-insensitive)
      const emailLower = trimmedEmail.toLowerCase();
      const existingUser = users.find(u => u.email === emailLower);
      if (existingUser) {
        return res.status(400).render('auth/register', { error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const newUser: User = {
        id: uuidv4(),
        email: emailLower,
        passwordHash,
        createdAt: new Date().toISOString(),
      };

      // Save user
      users.push(newUser);
      writeUsers(users);

      // Success - redirect to login with flash message
      req.flash('success', 'Registration successful! Please log in.');
      res.redirect('/login');
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).render('auth/register', { error: 'Server error' });
  }
});

// GET /login
router.get('/login', (req: Request, res: Response) => {
  res.render('auth/login', {
    error: req.flash('error'),
    success: req.flash('success'),
  });
});

// POST /login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      req.flash('error', 'Email and password are required');
      return res.redirect('/login');
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/login');
    }

    // Success
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'Server error');
    res.redirect('/login');
  }
});

// POST /logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

export default router;