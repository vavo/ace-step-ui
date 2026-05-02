import { Router, Response } from 'express';
import { pool } from '../db/pool.js';
import { generateUUID } from '../db/sqlite.js';
import { authMiddleware, optionalAuthMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getStorageProvider } from '../services/storage/factory.js';
import { awardBadge, getUserBadges, getWeekStart } from '../services/gamification.js';
import { checkRateLimit } from '../services/rateLimit.js';

const router = Router();

const REPORT_TARGET_TYPES = new Set(['song', 'user', 'comment']);

function readLimit(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'string' ? Number(value) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function readOffset(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : 0;
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags !== 'string' || !tags.trim()) return [];

  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function resolvePublicAudioUrl(audioUrl: string | null): Promise<string | null> {
  if (!audioUrl) return null;
  if (!audioUrl.startsWith('s3://')) return audioUrl;

  const storageKey = audioUrl.replace('s3://', '');
  const storage = getStorageProvider();
  return storage.getPublicUrl(storageKey);
}

async function mapFeedSong(row: any) {
  return {
    id: row.id,
    title: row.title,
    lyrics: row.lyrics,
    style: row.style,
    caption: row.caption,
    cover_url: row.cover_url,
    audio_url: await resolvePublicAudioUrl(row.audio_url),
    duration: row.duration,
    bpm: row.bpm,
    key_scale: row.key_scale,
    time_signature: row.time_signature,
    tags: parseTags(row.tags),
    is_public: Boolean(row.is_public),
    like_count: row.like_count ?? 0,
    view_count: row.view_count ?? 0,
    comment_count: row.comment_count ?? 0,
    created_at: row.created_at,
    user_id: row.user_id,
    creator: row.creator ?? 'Anonymous',
    creator_avatar: row.creator_avatar,
    is_liked: Boolean(row.is_liked),
    leaderboard_score: row.leaderboard_score ?? undefined,
  };
}

router.get('/feed', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = readLimit(req.query.limit, 20, 50);
    const offset = readOffset(req.query.offset);
    const params: unknown[] = [];

    const likedSelect = req.user
      ? `EXISTS (
          SELECT 1 FROM liked_songs ls
          WHERE ls.song_id = s.id AND ls.user_id = ?
        ) as is_liked`
      : '0 as is_liked';

    if (req.user) params.push(req.user.id);

    const blockFilter = req.user
      ? `AND s.user_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?)
         AND s.user_id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_id = ?)`
      : '';

    if (req.user) {
      params.push(req.user.id, req.user.id);
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT s.id, s.title, s.lyrics, s.style, s.caption, s.cover_url, s.audio_url,
              s.duration, s.bpm, s.key_scale, s.time_signature, s.tags, s.is_public,
              s.like_count, s.view_count, s.user_id, s.created_at,
              u.username as creator, u.avatar_url as creator_avatar,
              (SELECT COUNT(*) FROM comments c WHERE c.song_id = s.id) as comment_count,
              ${likedSelect}
       FROM songs s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.is_public = 1
       ${blockFilter}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    res.json({
      items: await Promise.all(result.rows.map(mapFeedSong)),
      pagination: {
        limit,
        offset,
        nextOffset: result.rows.length === limit ? offset + limit : null,
      },
    });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to load feed' });
  }
});

router.get('/leaderboards', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = readLimit(req.query.limit, 10, 50);
    const period = req.query.period === 'weekly' || req.query.period === undefined ? 'weekly' : String(req.query.period);
    if (period !== 'weekly') {
      res.status(400).json({ error: 'Only weekly leaderboards are available' });
      return;
    }

    const periodStart = getWeekStart();

    const songResult = await pool.query(
      `SELECT s.id, s.title, s.lyrics, s.style, s.caption, s.cover_url, s.audio_url,
              s.duration, s.bpm, s.key_scale, s.time_signature, s.tags, s.is_public,
              s.like_count, s.view_count, s.user_id, s.created_at,
              u.username as creator, u.avatar_url as creator_avatar,
              (SELECT COUNT(*) FROM comments c WHERE c.song_id = s.id) as comment_count,
              COALESCE(SUM(e.points), 0) as event_points,
              CASE
                WHEN COALESCE(SUM(e.points), 0) > 0 THEN COALESCE(SUM(e.points), 0)
                ELSE COALESCE(s.like_count, 0) * 5 + COALESCE(s.view_count, 0)
              END as leaderboard_score
       FROM songs s
       LEFT JOIN users u ON s.user_id = u.id
       LEFT JOIN leaderboard_events e ON e.song_id = s.id AND e.period_start = ?
       WHERE s.is_public = 1
         AND (s.created_at >= ? OR e.id IS NOT NULL)
       GROUP BY s.id
       ORDER BY leaderboard_score DESC, s.created_at DESC
       LIMIT ?`,
      [periodStart, periodStart, limit]
    );

    const creatorResult = await pool.query(
      `WITH weekly_songs AS (
         SELECT user_id,
                COUNT(*) as published_song_count,
                COALESCE(SUM(like_count), 0) as likes_received
         FROM songs
         WHERE is_public = 1 AND created_at >= ?
         GROUP BY user_id
       ),
       weekly_followers AS (
         SELECT following_id as user_id,
                COUNT(*) as follower_growth
         FROM followers
         WHERE created_at >= ?
         GROUP BY following_id
       ),
       weekly_events AS (
         SELECT user_id,
                COALESCE(SUM(points), 0) as event_points
         FROM leaderboard_events
         WHERE period_start = ?
         GROUP BY user_id
       )
       SELECT u.id, u.username, u.avatar_url, u.bio, u.xp, u.level,
              COALESCE(ws.published_song_count, 0) as published_song_count,
              COALESCE(ws.likes_received, 0) as likes_received,
              COALESCE(wf.follower_growth, 0) as follower_growth,
              COALESCE(we.event_points, 0) as event_points,
              (
                COALESCE(ws.published_song_count, 0) * 20
                + COALESCE(ws.likes_received, 0) * 5
                + COALESCE(wf.follower_growth, 0) * 10
                + COALESCE(we.event_points, 0)
              ) as leaderboard_score
       FROM users u
       LEFT JOIN weekly_songs ws ON ws.user_id = u.id
       LEFT JOIN weekly_followers wf ON wf.user_id = u.id
       LEFT JOIN weekly_events we ON we.user_id = u.id
       WHERE COALESCE(ws.published_song_count, 0) > 0
          OR COALESCE(ws.likes_received, 0) > 0
          OR COALESCE(wf.follower_growth, 0) > 0
          OR COALESCE(we.event_points, 0) > 0
       ORDER BY leaderboard_score DESC, COALESCE(u.xp, 0) DESC
       LIMIT ?`,
      [periodStart, periodStart, periodStart, limit]
    );

    const songs = await Promise.all(songResult.rows.map(mapFeedSong));
    const creators = creatorResult.rows.map((row, index) => {
      const rank = index + 1;
      const leaderboardScore = row.leaderboard_score ?? 0;
      if (rank <= 10 && leaderboardScore > 0) {
        awardBadge(row.id, 'weekly_top_10', { periodStart, rank, leaderboardScore });
      }

      return {
        id: row.id,
        username: row.username,
        avatar_url: row.avatar_url,
        bio: row.bio,
        xp: row.xp ?? 0,
        level: row.level ?? 1,
        rank,
        published_song_count: row.published_song_count ?? 0,
        likes_received: row.likes_received ?? 0,
        follower_growth: row.follower_growth ?? 0,
        event_points: row.event_points ?? 0,
        leaderboard_score: leaderboardScore,
        badges: getUserBadges(row.id),
      };
    });

    res.json({
      period,
      periodStart,
      songs,
      creators,
    });
  } catch (error) {
    console.error('Get leaderboards error:', error);
    res.status(500).json({ error: 'Failed to load leaderboards' });
  }
});

router.post('/reports', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rateLimit = checkRateLimit({
      userId: req.user!.id,
      action: 'report',
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      res.status(429).json({ error: 'Too many reports', retryAfterSeconds: rateLimit.retryAfterSeconds });
      return;
    }

    const { targetType, targetId, reason, details } = req.body as {
      targetType?: string;
      targetId?: string;
      reason?: string;
      details?: string;
    };

    if (!targetType || !REPORT_TARGET_TYPES.has(targetType) || !targetId) {
      res.status(400).json({ error: 'Invalid report target' });
      return;
    }

    const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 80) : '';
    if (!cleanReason) {
      res.status(400).json({ error: 'Report reason is required' });
      return;
    }

    const id = generateUUID();
    await pool.query(
      `INSERT INTO reports
         (id, reporter_id, target_type, target_id, reason, details, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'))`,
      [
        id,
        req.user!.id,
        targetType,
        targetId,
        cleanReason,
        typeof details === 'string' ? details.trim().slice(0, 1000) : null,
      ]
    );

    res.status(201).json({ report: { id, targetType, targetId, reason: cleanReason, status: 'open' } });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

router.get('/blocks', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.avatar_url, b.created_at
       FROM user_blocks b
       JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = ?
       ORDER BY b.created_at DESC`,
      [req.user!.id]
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get blocks error:', error);
    res.status(500).json({ error: 'Failed to load blocked users' });
  }
});

router.post('/blocks/:username', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const target = await pool.query('SELECT id, username FROM users WHERE username = ?', [req.params.username]);
    if (target.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const blockedUser = target.rows[0];
    if (blockedUser.id === req.user!.id) {
      res.status(400).json({ error: 'Cannot block yourself' });
      return;
    }

    await pool.query(
      `INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at)
       VALUES (?, ?, datetime('now'))`,
      [req.user!.id, blockedUser.id]
    );
    await pool.query(
      `DELETE FROM followers
       WHERE (follower_id = ? AND following_id = ?)
          OR (follower_id = ? AND following_id = ?)`,
      [req.user!.id, blockedUser.id, blockedUser.id, req.user!.id]
    );

    res.json({ blocked: true, user: blockedUser });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

router.delete('/blocks/:username', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const target = await pool.query('SELECT id, username FROM users WHERE username = ?', [req.params.username]);
    if (target.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await pool.query(
      'DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
      [req.user!.id, target.rows[0].id]
    );

    res.json({ blocked: false, user: target.rows[0] });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

export default router;
