import { randomBytes, createHash } from 'crypto';
import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';
import { pool } from '../db/pool.js';
import { generateUUID } from '../db/sqlite.js';
import type { AuthenticatedUser } from '../middleware/auth.js';
import { isSuperadminEmail } from './superadmin.js';

export const SESSION_COOKIE = 'acestep_session';
export const OAUTH_STATE_COOKIE = 'acestep_oauth_state';

const jwtOptions = { expiresIn: config.jwt.expiresIn } as SignOptions;

export const userSelectFields = [
  'id',
  'username',
  'email',
  'display_name',
  'bio',
  'avatar_url',
  'banner_url',
  'is_admin',
  'default_vocal_language',
  'default_ui_language',
  'plan',
  'credit_balance',
  'xp',
  'level',
  'created_at',
].join(', ');

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function buildUserPayload(user: { [key: string]: unknown }) {
  const isSuperadmin = isSuperadminEmail(user.email);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    display_name: user.display_name,
    bio: user.bio,
    avatar_url: user.avatar_url,
    banner_url: user.banner_url,
    isAdmin: Boolean(user.is_admin) || isSuperadmin,
    createdAt: user.created_at,
    created_at: user.created_at,
    default_vocal_language: user.default_vocal_language || 'en',
    default_ui_language: user.default_ui_language || 'sk',
    plan: user.plan || 'free',
    accountTier: isSuperadmin ? 'superadmin' : user.plan || 'free',
    credit_balance: user.credit_balance ?? 0,
    unlimitedCredits: isSuperadmin,
    xp: user.xp ?? 0,
    level: user.level ?? 1,
  };
}

export function issueAccessToken(payload: { id: string; username: string; isAdmin?: boolean }): string {
  return jwt.sign(payload, config.jwt.secret, jwtOptions);
}

export function issueUserAccessToken(user: { [key: string]: unknown }): string {
  return issueAccessToken({
    id: String(user.id),
    username: String(user.username),
    isAdmin: Boolean(user.is_admin) || isSuperadminEmail(user.email),
  });
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return null;
}

export async function createSession(res: Response, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const maxAgeMs = Math.max(1, config.auth.sessionDays) * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now + maxAgeMs).toISOString();

  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [generateUUID(), userId, hashToken(token), expiresAt]
  );

  res.cookie(SESSION_COOKIE, token, cookieOptions(maxAgeMs));
  return token;
}

export async function clearSession(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    await pool.query('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(token)]);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function readSessionUser(req: Request): Promise<AuthenticatedUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.is_admin
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')
     LIMIT 1`,
    [hashToken(token)]
  );

  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  return {
    id: user.id,
    username: user.username,
    isAdmin: Boolean(user.is_admin) || isSuperadminEmail(user.email),
  };
}

export function readBearerUser(req: Request): AuthenticatedUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  return jwt.verify(token, config.jwt.secret) as AuthenticatedUser;
}

export async function readAuthenticatedUser(req: Request): Promise<AuthenticatedUser | null> {
  const sessionUser = await readSessionUser(req);
  if (sessionUser) return sessionUser;
  if (config.nodeEnv === 'production') return null;
  return readBearerUser(req);
}

export function authResponse(user: { [key: string]: unknown }, res: Response) {
  const payload = buildUserPayload(user);
  const token = issueUserAccessToken(user);

  return res.json({ user: payload, token });
}
