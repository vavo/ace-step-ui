import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { generateUUID } from '../db/sqlite.js';
import { config } from '../config/index.js';
import { authMiddleware, AuthenticatedRequest, optionalAuthMiddleware } from '../middleware/auth.js';
import {
  authResponse,
  buildUserPayload,
  clearSession,
  createSession,
  issueUserAccessToken,
  OAUTH_STATE_COOKIE,
  readCookie,
  userSelectFields,
} from '../services/authSessions.js';
import { recordSignupGrantIfMissing } from '../services/credits.js';

const router = Router();
const scrypt = promisify(scryptCallback);

interface SetupBody {
  username: string;
}

interface EmailRegisterBody {
  email: string;
  password: string;
  username: string;
}

interface EmailLoginBody {
  email: string;
  password: string;
}

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  password: string;
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

function getPasswordResetBaseUrl(): string {
  return config.auth.passwordResetBaseUrl.replace(/\/$/, '');
}

function googleConfigured(): boolean {
  return Boolean(config.auth.googleClientId && config.auth.googleClientSecret);
}

router.get('/options', (_req: Request, res: Response) => {
  res.json({
    googleConfigured: googleConfigured(),
    localAuthAllowed: isLocalAuthAllowed(),
    emailAuthAllowed: true,
  });
});

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

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8 && password.length <= 256;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, storedHash: unknown): Promise<boolean> {
  if (typeof storedHash !== 'string') return false;
  const [scheme, salt, encodedHash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !salt || !encodedHash) return false;

  const expected = Buffer.from(encodedHash, 'base64url');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function buildResetUrl(token: string): string {
  return `${getPasswordResetBaseUrl()}/?resetToken=${encodeURIComponent(token)}`;
}

async function upsertGoogleUser(profile: GoogleProfile) {
  const profileEmail = normalizeEmail(profile.email) || null;
  const byGoogleSub = await pool.query(`SELECT ${userSelectFields} FROM users WHERE google_sub = ?`, [profile.sub]);
  if (byGoogleSub.rows.length > 0) {
    const user = byGoogleSub.rows[0];
    await pool.query(
      `UPDATE users
       SET email = ?, display_name = ?, avatar_url = COALESCE(avatar_url, ?), auth_provider = 'google', updated_at = datetime('now')
       WHERE id = ?`,
      [profileEmail, profile.name || null, profile.picture || null, user.id]
    );
    const updated = await pool.query(`SELECT ${userSelectFields} FROM users WHERE id = ?`, [user.id]);
    return updated.rows[0];
  }

  if (profileEmail) {
    const byEmail = await pool.query(`SELECT ${userSelectFields} FROM users WHERE email = ?`, [profileEmail]);
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

  const emailName = profileEmail?.split('@')[0] || '';
  const username = await uniqueUsername(profile.name || emailName || 'creator');
  const userId = generateUUID();
  await pool.query(
    `INSERT INTO users
       (id, username, email, google_sub, auth_provider, display_name, avatar_url, is_admin, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'google', ?, ?, 0, datetime('now'), datetime('now'))`,
    [userId, username, profileEmail, profile.sub, profile.name || null, profile.picture || null]
  );

  const newUser = await pool.query(`SELECT ${userSelectFields} FROM users WHERE id = ?`, [userId]);
  recordSignupGrantIfMissing(userId);
  return newUser.rows[0];
}

// Auto-login: Get the default user from database (for local single-user app)
router.get('/auto', async (_req: Request, res: Response) => {
  try {
    if (!isLocalAuthAllowed()) {
      res.json({ authenticated: false, user: null, token: null });
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
      recordSignupGrantIfMissing(userId);
    }

    // Generate token
    const token = issueUserAccessToken(user);

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
      recordSignupGrantIfMissing(userId);
    }

    await createLocalSession(user, res);
  } catch (error) {
    console.error('Local dev login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/email/register', async (req: Request<object, object, Partial<EmailRegisterBody>>, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    const username = sanitizeUsername(req.body.username || email.split('@')[0] || 'creator');

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }

    if (!isValidPassword(password)) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    if (username.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters' });
      return;
    }

    const existingEmail = await pool.query('SELECT id, password_hash FROM users WHERE email = ?', [email]);
    if (existingEmail.rows.length > 0) {
      res.status(409).json({ error: 'Email is already registered' });
      return;
    }

    const existingUsername = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsername.rows.length > 0) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }

    const userId = generateUUID();
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO users
         (id, username, email, password_hash, auth_provider, is_admin, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'email', 0, datetime('now'), datetime('now'))`,
      [userId, username, email, passwordHash]
    );

    const created = await pool.query(`SELECT ${userSelectFields} FROM users WHERE id = ?`, [userId]);
    const user = created.rows[0];
    recordSignupGrantIfMissing(userId);
    await createLocalSession(user, res);
  } catch (error) {
    console.error('Email registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/email/login', async (req: Request<object, object, Partial<EmailLoginBody>>, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!isValidEmail(email) || !isValidPassword(password)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const result = await pool.query(
      `SELECT ${userSelectFields}, password_hash FROM users WHERE email = ?`,
      [email]
    );
    const user = result.rows[0];
    const passwordMatches = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !passwordMatches) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    await pool.query(
      `UPDATE users SET auth_provider = CASE WHEN auth_provider = 'local' THEN 'email' ELSE auth_provider END,
                        updated_at = datetime('now')
       WHERE id = ?`,
      [user.id]
    );
    await createLocalSession(user, res);
  } catch (error) {
    console.error('Email login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/password/forgot', async (req: Request<object, object, Partial<ForgotPasswordBody>>, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const genericResponse: { sent: boolean; resetUrl?: string } = { sent: true };

    if (!isValidEmail(email)) {
      res.json(genericResponse);
      return;
    }

    const result = await pool.query(
      `SELECT id, password_hash FROM users WHERE email = ?`,
      [email]
    );
    const user = result.rows[0];

    if (!user?.id || !user.password_hash) {
      res.json(genericResponse);
      return;
    }

    await pool.query(
      `UPDATE password_reset_tokens
       SET used_at = datetime('now')
       WHERE user_id = ? AND used_at IS NULL`,
      [user.id]
    );

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [generateUUID(), user.id, tokenHash, expiresAt]
    );

    res.json({
      sent: true,
      resetUrl: buildResetUrl(token),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to create password reset' });
  }
});

router.post('/password/reset', async (req: Request<object, object, Partial<ResetPasswordBody>>, res: Response) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    const password = req.body.password;

    if (!token || !isValidPassword(password)) {
      res.status(400).json({ error: 'Invalid or expired reset link' });
      return;
    }

    const tokenHash = hashResetToken(token);
    const result = await pool.query(
      `SELECT prt.id, prt.user_id
       FROM password_reset_tokens prt
       INNER JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ?
         AND prt.used_at IS NULL
         AND prt.expires_at > ?
         AND u.password_hash IS NOT NULL
       LIMIT 1`,
      [tokenHash, new Date().toISOString()]
    );
    const reset = result.rows[0];

    if (!reset) {
      res.status(400).json({ error: 'Invalid or expired reset link' });
      return;
    }

    const passwordHash = await hashPassword(password);
    await pool.query(
      `UPDATE users
       SET password_hash = ?, auth_provider = CASE WHEN auth_provider = 'local' THEN 'email' ELSE auth_provider END, updated_at = datetime('now')
       WHERE id = ?`,
      [passwordHash, reset.user_id]
    );
    await pool.query(
      `UPDATE password_reset_tokens
       SET used_at = datetime('now')
       WHERE user_id = ? AND used_at IS NULL`,
      [reset.user_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
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
router.get('/session', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.json({ authenticated: false, user: null, token: null });
      return;
    }

    const result = await pool.query(
      `SELECT ${userSelectFields} FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      res.json({ authenticated: false, user: null, token: null });
      return;
    }

    const user = result.rows[0];
    const token = issueUserAccessToken(user);

    res.json({ authenticated: true, user: buildUserPayload(user), token });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    const token = issueUserAccessToken(user);

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
    const token = issueUserAccessToken(user);

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
    const token = issueUserAccessToken(user);

    res.json({ user: buildUserPayload(user), token });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
