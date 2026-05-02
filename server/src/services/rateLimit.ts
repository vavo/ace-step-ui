import { db, transaction } from '../db/sqlite.js';

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function checkRateLimit(params: {
  userId: string;
  action: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  return transaction(() => {
    const now = params.now ?? Date.now();
    db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').run(now);

    const bucket = db.prepare(
      `SELECT count, reset_at
       FROM rate_limits
       WHERE user_id = ? AND action = ?`
    ).get(params.userId, params.action) as { count: number; reset_at: number } | undefined;

    if (!bucket) {
      db.prepare(
        `INSERT INTO rate_limits (user_id, action, count, reset_at, updated_at)
         VALUES (?, ?, 1, ?, datetime('now'))`
      ).run(params.userId, params.action, now + params.windowMs);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (bucket.count >= params.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.reset_at - now) / 1000)),
      };
    }

    db.prepare(
      `UPDATE rate_limits
       SET count = count + 1, updated_at = datetime('now')
       WHERE user_id = ? AND action = ?`
    ).run(params.userId, params.action);

    return { allowed: true, retryAfterSeconds: 0 };
  });
}
