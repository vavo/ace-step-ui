import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { generateUUID } from '../db/sqlite.js';
import { config } from '../config/index.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import {
  authResponse,
  buildUserPayload,
  clearSession,
  createSession,
  issueAccessToken,
  OAUTH_STATE_COOKIE,
  readCookie,
  userSelectFields,
} from '../services/authSessions.js';

const router = Router();

interface SetupBody {
  username: string;
}

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function isLocalAuthAllowed(): boolean {
  return config.nodeEnv !== 'production';
}

function getPublicApiUrl(): string {
  return (config.auth.publicApiUrl || config.frontendUrl).replace(/\/$/, '');
}

function getGoogleCallbackUrl(): string {
  return config.auth.googleCallbackUrl || `${getPublicApiUrl()}/api/auth/google/callback`;
}

function googleConfigured(): boolean {
  return Boolean(config.auth.googleClientId && config.auth.googleClientSecret);
}

function sanitizeUsername(username: string): string {
  return username
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 50);
}

async function uniqueUsername(seed: string): Promise<string> {
  const base = sanitizeUsername(seed).slice(0, 24) || 'creator';

  for (let i = 0; i < 25; i += 1) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    const existing = await pool.query('SELECT id FROM users WHERE username = ?', [candidate]);
    if (existing.rows.length === 0) return candidate;
  }

  return `${base}${Math.random().toString(36).slice(2, 8)}`;
}

async function createLocalSession(user: { [key: string]: unknown }, res: Response): Promise<void> {
  await createSession(res, String(user.id));
  authResponse(user, res);
}

async function upsertGoogleUser(profile: GoogleProfile) {
  const byGoogleSub = await pool.query(`SELECT ${userSelectFields} FROM users WHERE google_sub = ?`, [profile.sub]);
  if (byGoogleSub.rows.length > 0) {
    const user = byGoogleSub.rows[0];
    await pool.query(
      `UPDATE users
       SET email = ?, display_name = ?, avatar_url = COALESCE(avatar_url, ?), auth_provider = 'google', updated_at = datetime('now')
       WHERE id = ?`,
      [profile.email || null, profile.name || null, profile.picture || null, user.id]
    );
    const updated = await pool.query(`SELECT ${userSelectFields} FROM users WHERE id = ?`, [user.id]);
    return updated.rows[0];
  }

  if (profile.email) {
    const byEmail = await pool.query(`SELECT ${userSelectFields} FROM users WHERE email = ?`, [profile.email]);
    if (byEmail.rows.length > 0) {
      const user = byEmail.rows[0];
      await pool.query(
        `UPDATE users
         SET google_sub = ?, display_name = ?, avatar_url = COALESCE(avatar_url, ?), auth_provider = 'google', updated_at = datetime('now')
         WHERE id = ?`,
        [profile.sub, profile.name || null, profile.picture || null, user.id]
      );
      const updated = await pool.query(`SELECT ${userSelectFields} FROM users WHERE id = ?`, [user.id]);
      return updated.rows[0];
    }
  }

  const emailName = profile.email?.split('@')[0] || '';
  const username = await uniqueUsername(profile.name || emailName || 'creator');
  const userId = generateUUID();
  await pool.query(
    `INSERT INTO users
       (id, username, email, google_sub, auth_provider, display_name, avatar_url, is_admin, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'google', ?, ?, 0, datetime('now'), datetime('now'))`,
    [userId, username, profile.email || null, profile.sub, profile.name || null, profile.picture || null]
  );

  const newUser = await pool.query(`SELECT ${userSelectFields} FROM users WHERE id = ?`, [userId]);
  return newUser.rows[0];
}

// Auto-login: Get the default user from database (for local single-user app)
router.get('/auto', async (_req: Request, res: Response) => {
  try {
    if (!isLocalAuthAllowed()) {
      res.status(404).json({ error: 'Local auto-login is disabled' });
      return;
    }

    // Get the first user from the database (local app typically has one user)
    const result = await pool.query(
      `SELECT ${userSelectFields} FROM users ORDER BY created_at ASC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // No user exists yet - frontend should show username setup
      res.status(404).json({ error: 'No user found' });
      return;
    }

    await createLocalSession(result.rows[0], res);
  } catch (error) {
    console.error('Auto-login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Setup or get user by username (simplified auth for local app)
router.post('/setup', async (req: Request<object, object, SetupBody>, res: Response) => {
  try {
    if (!isLocalAuthAllowed()) {
      res.status(403).json({ error: 'Use Google sign-in' });
      return;
    }

    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    // Sanitize username
    const sanitizedUsername = sanitizeUsername(username);

    if (sanitizedUsername.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters' });
      return;
    }

    // Check if user exists
    const existingUser = await pool.query(
      `SELECT ${userSelectFields} FROM users WHERE username = ?`,
      [sanitizedUsername]
    );

    let user;

    if (existingUser.rows.length > 0) {
      // User exists, return it
      user = existingUser.rows[0];
    } else {
      // Create new user
      const userId = generateUUID();
      await pool.query(
        `INSERT INTO users (id, username, is_admin, created_at, updated_at)
         VALUES (?, ?, 0, datetime('now'), datetime('now'))`,
        [userId, sanitizedUsername]
      );

      const newUser = await pool.query(
        `SELECT ${userSelectFields} FROM users WHERE id = ?`,
        [userId]
      );
      user = newUser.rows[0];
    }

    // Generate token
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    await createSession(res, user.id);
    res.status(200).json({
      user: buildUserPayload(user),
      token,
    });
  } catch (error) {
    console.error('Auth setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/local-dev', async (req: Request<object, object, Partial<SetupBody>>, res: Response) => {
  try {
    if (!isLocalAuthAllowed()) {
      res.status(403).json({ error: 'Local dev login is disabled' });
      return;
    }

    const username = sanitizeUsername(req.body.username || 'demo_creator');
    const existingUser = await pool.query(`SELECT ${userSelectFields} FROM users WHERE username = ?`, [username]);

    let user = existingUser.rows[0];
    if (!user) {
      const userId = generateUUID();
      await pool.query(
        `INSERT INTO users (id, username, auth_provider, is_admin, created_at, updated_at)
         VALUES (?, ?, 'local', 0, datetime('now'), datetime('now'))`,
        [userId, username]
      );
      const created = await pool.query(`SELECT ${userSelectFields} FROM users WHERE id = ?`, [userId]);
      user = created.rows[0];
    }

    await createLocalSession(user, res);
  } catch (error) {
    console.error('Local dev login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/google/start', async (_req: Request, res: Response) => {
  if (!googleConfigured()) {
    res.status(503).json({ error: 'Google OAuth is not configured' });
    return;
  }

  const state = generateUUID();
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: config.auth.googleClientId,
    redirect_uri: getGoogleCallbackUrl(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    if (!googleConfigured()) {
      res.status(503).json({ error: 'Google OAuth is not configured' });
      return;
    }

    const expectedState = readCookie(req, OAUTH_STATE_COOKIE);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!expectedState || !state || expectedState !== state || !code) {
      res.status(400).json({ error: 'Invalid OAuth callback' });
      return;
    }

    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.auth.googleClientId,
        client_secret: config.auth.googleClientSecret,
        redirect_uri: getGoogleCallbackUrl(),
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error || 'Token exchange failed');
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileResponse.json() as GoogleProfile;
    if (!profileResponse.ok || !profile.sub || !profile.email_verified) {
      throw new Error('Google profile verification failed');
    }

    const user = await upsertGoogleUser(profile);
    await createSession(res, user.id);
    res.redirect(`${config.frontendUrl.replace(/\/$/, '')}/?login=google`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${config.frontendUrl.replace(/\/$/, '')}/?login=failed`);
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ${userSelectFields} FROM users WHERE id = ?`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
      isAdmin: Boolean(user.is_admin),
    });

    res.json({ user: buildUserPayload(user), token });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update username
router.patch('/username', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    // Sanitize username
    const sanitizedUsername = username
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 50);

    if (sanitizedUsername.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters' });
      return;
    }

    // Check if username is taken by another user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [sanitizedUsername, req.user!.id]
    );

    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }

    // Update username
    await pool.query(
      `UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?`,
      [sanitizedUsername, req.user!.id]
    );

    // Get updated user
    const result = await pool.query(
      `SELECT ${userSelectFields} FROM users WHERE id = ?`,
      [req.user!.id]
    );

    const user = result.rows[0];

    // Issue new token with updated username
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.json({ user: buildUserPayload(user), token });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (no-op for local app, just for API compatibility)
router.post('/logout', async (_req: Request, res: Response) => {
  await clearSession(_req, res);
  res.json({ success: true });
});

// Refresh token (for API compatibility - just returns current user if token valid)
router.post('/refresh', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ${userSelectFields} FROM users WHERE id = ?`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.json({ user: buildUserPayload(user), token });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
