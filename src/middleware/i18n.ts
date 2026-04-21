import { Request, Response, NextFunction } from 'express';
import en from '../locales/en.json';
import ru from '../locales/ru.json';

const locales: Record<string, Record<string, string>> = { en, ru };

export function i18nMiddleware(req: Request, res: Response, next: NextFunction): void {
  const lang = (req.cookies?.lang ?? req.query?.lang ?? 'en') as string;
  const locale = locales[lang] ?? locales['en'];

  res.locals.t = (key: string): string => locale[key] ?? key;
  res.locals.lang = lang;

  // If lang was set via query param, save as cookie for 1 year
  if (req.query?.lang && typeof req.query.lang === 'string') {
    res.cookie('lang', req.query.lang, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: true,
      sameSite: 'strict',
    });
  }

  next();
}