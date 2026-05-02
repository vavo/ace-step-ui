import { db, generateUUID } from '../db/sqlite.js';

export type LeaderboardEventType =
  | 'publish_song'
  | 'song_like'
  | 'song_play'
  | 'comment'
  | 'follow_created'
  | 'follower_gain';

export type BadgeKey =
  | 'first_song'
  | 'first_10_likes'
  | 'weekly_top_10'
  | 'seven_day_streak';

type BadgeDefinition = {
  id: BadgeKey;
  label: string;
  description: string;
  color: 'green' | 'pink' | 'yellow' | 'blue';
};

const BADGES: Record<BadgeKey, BadgeDefinition> = {
  first_song: {
    id: 'first_song',
    label: 'First song',
    description: 'Published a first public song.',
    color: 'green',
  },
  first_10_likes: {
    id: 'first_10_likes',
    label: '10 likes',
    description: 'Received 10 likes on public songs.',
    color: 'pink',
  },
  weekly_top_10: {
    id: 'weekly_top_10',
    label: 'Weekly top 10',
    description: 'Reached the weekly creator top 10.',
    color: 'yellow',
  },
  seven_day_streak: {
    id: 'seven_day_streak',
    label: '7-day streak',
    description: 'Claimed daily credits for seven days in a row.',
    color: 'blue',
  },
};

const XP = {
  publishSong: 25,
  receiveLike: 5,
  addComment: 3,
  followUser: 5,
  receiveFollow: 8,
} as const;

function runGamification(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.error(`[Gamification] ${label} failed:`, error);
  }
}

export function getWeekStart(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

function addXp(userId: string, points: number): void {
  if (points <= 0) return;

  const row = db.prepare('SELECT xp FROM users WHERE id = ?').get(userId) as { xp: number | null } | undefined;
  if (!row) return;

  const nextXp = (row.xp ?? 0) + points;
  db.prepare(
    `UPDATE users
     SET xp = ?, level = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextXp, levelForXp(nextXp), userId);
}

export function awardBadge(userId: string, badgeKey: BadgeKey, metadata?: Record<string, unknown>): void {
  db.prepare(
    `INSERT OR IGNORE INTO user_badges (user_id, badge_key, metadata, awarded_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(userId, badgeKey, metadata ? JSON.stringify(metadata) : null);
}

function refreshWeeklyTopCreatorBadges(periodStart = getWeekStart()): void {
  const rows = db.prepare(
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
     SELECT u.id,
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
     ORDER BY leaderboard_score DESC
     LIMIT 10`
  ).all(periodStart, periodStart, periodStart) as Array<{ id: string; leaderboard_score: number }>;

  rows.forEach((row, index) => {
    if ((row.leaderboard_score ?? 0) > 0) {
      awardBadge(row.id, 'weekly_top_10', {
        periodStart,
        rank: index + 1,
        leaderboardScore: row.leaderboard_score,
      });
    }
  });
}

export function getUserBadges(userId: string): Array<BadgeDefinition & {
  badge_key: BadgeKey;
  awarded_at: string;
  metadata: Record<string, unknown> | null;
}> {
  const rows = db.prepare(
    `SELECT badge_key, awarded_at, metadata
     FROM user_badges
     WHERE user_id = ?
     ORDER BY awarded_at DESC`
  ).all(userId) as Array<{
    badge_key: BadgeKey;
    awarded_at: string;
    metadata: string | null;
  }>;

  return rows.map((row) => {
    const definition = BADGES[row.badge_key] ?? {
      id: row.badge_key,
      label: row.badge_key,
      description: row.badge_key,
      color: 'blue' as const,
    };

    return {
      ...definition,
      badge_key: row.badge_key,
      awarded_at: row.awarded_at,
      metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : null,
    };
  });
}

function recordLeaderboardEvent(params: {
  userId: string;
  songId?: string | null;
  eventType: LeaderboardEventType;
  points: number;
  metadata?: Record<string, unknown>;
}): void {
  const periodStart = getWeekStart();
  db.prepare(
    `INSERT INTO leaderboard_events
       (id, user_id, song_id, event_type, points, period_start, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    generateUUID(),
    params.userId,
    params.songId ?? null,
    params.eventType,
    params.points,
    periodStart,
    params.metadata ? JSON.stringify(params.metadata) : null
  );
  refreshWeeklyTopCreatorBadges(periodStart);
}

export function recordPublishedSong(userId: string, songId: string): void {
  runGamification('record publish', () => {
    const existing = db.prepare(
      `SELECT 1
       FROM leaderboard_events
       WHERE song_id = ? AND event_type = 'publish_song'
       LIMIT 1`
    ).get(songId);

    if (!existing) {
      recordLeaderboardEvent({
        userId,
        songId,
        eventType: 'publish_song',
        points: XP.publishSong,
      });
      addXp(userId, XP.publishSong);
    }

    const publicSongCount = db.prepare(
      `SELECT COUNT(*) as count
       FROM songs
       WHERE user_id = ? AND is_public = 1`
    ).get(userId) as { count: number };

    if (publicSongCount.count >= 1) {
      awardBadge(userId, 'first_song', { songId });
    }
  });
}

export function recordSongLike(songId: string, likedByUserId: string): void {
  runGamification('record like', () => {
    const song = db.prepare(
      `SELECT user_id, like_count
       FROM songs
       WHERE id = ?`
    ).get(songId) as { user_id: string; like_count: number | null } | undefined;

    if (!song || song.user_id === likedByUserId) return;

    recordLeaderboardEvent({
      userId: song.user_id,
      songId,
      eventType: 'song_like',
      points: XP.receiveLike,
      metadata: { likedByUserId },
    });
    addXp(song.user_id, XP.receiveLike);

    const likes = db.prepare(
      `SELECT COALESCE(SUM(like_count), 0) as count
       FROM songs
       WHERE user_id = ? AND is_public = 1`
    ).get(song.user_id) as { count: number };

    if (likes.count >= 10) {
      awardBadge(song.user_id, 'first_10_likes', { likes: likes.count });
    }
  });
}

export function recordSongPlay(songId: string, playedByUserId?: string): void {
  runGamification('record play', () => {
    const song = db.prepare(
      `SELECT user_id
       FROM songs
       WHERE id = ? AND is_public = 1`
    ).get(songId) as { user_id: string } | undefined;

    if (!song) return;

    recordLeaderboardEvent({
      userId: song.user_id,
      songId,
      eventType: 'song_play',
      points: 1,
      metadata: playedByUserId ? { playedByUserId } : undefined,
    });
  });
}

export function recordComment(commenterUserId: string, songId: string, commentId: string): void {
  runGamification('record comment', () => {
    recordLeaderboardEvent({
      userId: commenterUserId,
      songId,
      eventType: 'comment',
      points: XP.addComment,
      metadata: { commentId },
    });
    addXp(commenterUserId, XP.addComment);
  });
}

export function recordFollow(followerId: string, followingId: string): void {
  runGamification('record follow', () => {
    recordLeaderboardEvent({
      userId: followerId,
      eventType: 'follow_created',
      points: XP.followUser,
      metadata: { followingId },
    });
    recordLeaderboardEvent({
      userId: followingId,
      eventType: 'follower_gain',
      points: XP.receiveFollow,
      metadata: { followerId },
    });
    addXp(followerId, XP.followUser);
    addXp(followingId, XP.receiveFollow);
  });
}
