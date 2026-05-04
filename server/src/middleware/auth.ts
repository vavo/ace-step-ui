import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';
import { readAuthenticatedUser } from '../services/authSessions.js';
import { isSuperadminEmail } from '../services/superadmin.js';

export interface AuthenticatedUser {
  id: string;
  username: string;
  isAdmin?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await readAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'No active session' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    req.user = await readAuthenticatedUser(req) ?? undefined;
  } catch {
    // Invalid auth should not block public reads.
  }

  next();
}

export async function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await readAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'No active session' });
      return;
    }

    const result = await pool.query(
      'SELECT email, is_admin FROM users WHERE id = ?',
      [user.id]
    );

    if (result.rows.length === 0 || (!result.rows[0].is_admin && !isSuperadminEmail(result.rows[0].email))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    req.user = { ...user, isAdmin: true };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
