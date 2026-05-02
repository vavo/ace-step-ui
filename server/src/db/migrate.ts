import { db } from './pool.js';

const migrations = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  google_sub TEXT,
  auth_provider TEXT DEFAULT 'local',
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  default_vocal_language TEXT DEFAULT 'en',
  default_ui_language TEXT DEFAULT 'sk',
  plan TEXT DEFAULT 'free',
  credit_balance INTEGER DEFAULT 100,
  last_daily_credit_claim_at TEXT,
  credit_streak_days INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Songs table
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  lyrics TEXT,
  style TEXT,
  caption TEXT,
  cover_url TEXT,
  audio_url TEXT,
  duration INTEGER,
  bpm INTEGER,
  key_scale TEXT,
  time_signature TEXT,
  tags TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  has_video INTEGER DEFAULT 0,
  video_url TEXT,
  generation_params TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Generation jobs table (simplified - no credit_reserved)
CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acestep_task_id TEXT,
  status TEXT DEFAULT 'pending',
  params TEXT,
  result TEXT,
  error TEXT,
  credit_cost INTEGER DEFAULT 0,
  credits_reserved INTEGER DEFAULT 0,
  credits_refunded INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  is_public INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Playlist songs junction table
CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (playlist_id, song_id)
);

-- Liked songs table
CREATE TABLE IF NOT EXISTS liked_songs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  liked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, song_id)
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Followers table
CREATE TABLE IF NOT EXISTS followers (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Reference tracks (uploaded audio for use as references)
CREATE TABLE IF NOT EXISTS reference_tracks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  duration INTEGER,
  file_size_bytes INTEGER,
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Contact submissions table
CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Auth sessions for the future Google OAuth flow
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Credit ledger for generation and lyric-draft accounting
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Gamification foundations
CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  awarded_at TEXT DEFAULT (datetime('now')),
  metadata TEXT,
  PRIMARY KEY (user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS leaderboard_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  period_start TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_songs_user_id ON songs(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at);
CREATE INDEX IF NOT EXISTS idx_songs_is_public ON songs(is_public);
CREATE INDEX IF NOT EXISTS idx_songs_is_featured ON songs(is_featured);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_created_at ON generation_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_song_id ON comments(song_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_followers_follower ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers(following_id);
CREATE INDEX IF NOT EXISTS idx_reference_tracks_user_id ON reference_tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_reference_tracks_created_at ON reference_tracks(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON credit_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_leaderboard_events_period ON leaderboard_events(period_start, event_type);
CREATE INDEX IF NOT EXISTS idx_leaderboard_events_user_id ON leaderboard_events(user_id);
`;

function getTableColumns(tableName: string): Set<string> {
  const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(tableInfo.map((col) => col.name));
}

function ensureColumn(tableName: string, existingColumns: Set<string>, columnName: string, definition: string): void {
  if (!existingColumns.has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    existingColumns.add(columnName);
  }
}

function ensureProductColumns(): void {
  const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!tableInfo) return;

  const existingColumns = getTableColumns('users');
  ensureColumn('users', existingColumns, 'email', 'TEXT');
  ensureColumn('users', existingColumns, 'google_sub', 'TEXT');
  ensureColumn('users', existingColumns, 'auth_provider', "TEXT DEFAULT 'local'");
  ensureColumn('users', existingColumns, 'display_name', 'TEXT');
  ensureColumn('users', existingColumns, 'default_vocal_language', "TEXT DEFAULT 'en'");
  ensureColumn('users', existingColumns, 'default_ui_language', "TEXT DEFAULT 'sk'");
  ensureColumn('users', existingColumns, 'plan', "TEXT DEFAULT 'free'");
  ensureColumn('users', existingColumns, 'credit_balance', 'INTEGER DEFAULT 100');
  ensureColumn('users', existingColumns, 'last_daily_credit_claim_at', 'TEXT');
  ensureColumn('users', existingColumns, 'credit_streak_days', 'INTEGER DEFAULT 0');
  ensureColumn('users', existingColumns, 'xp', 'INTEGER DEFAULT 0');
  ensureColumn('users', existingColumns, 'level', 'INTEGER DEFAULT 1');
  ensureColumn('users', existingColumns, 'stripe_customer_id', 'TEXT');
  ensureColumn('users', existingColumns, 'stripe_subscription_id', 'TEXT');
  ensureColumn('users', existingColumns, 'subscription_status', 'TEXT');

  db.exec(
    "UPDATE users SET default_ui_language = 'sk' WHERE default_ui_language IS NULL OR TRIM(default_ui_language) = ''"
  );
  db.exec("UPDATE users SET default_vocal_language = 'en' WHERE default_vocal_language IS NULL OR TRIM(default_vocal_language) = ''");
  db.exec("UPDATE users SET auth_provider = 'local' WHERE auth_provider IS NULL OR TRIM(auth_provider) = ''");
  db.exec("UPDATE users SET plan = 'free' WHERE plan IS NULL OR TRIM(plan) = ''");
  db.exec("UPDATE users SET credit_balance = 100 WHERE credit_balance IS NULL");
  db.exec("UPDATE users SET credit_streak_days = 0 WHERE credit_streak_days IS NULL");
  db.exec("UPDATE users SET xp = 0 WHERE xp IS NULL");
  db.exec("UPDATE users SET level = 1 WHERE level IS NULL OR level < 1");
}

function ensureGenerationJobColumns(): void {
  const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'generation_jobs'").get();
  if (!tableInfo) return;

  const existingColumns = getTableColumns('generation_jobs');
  ensureColumn('generation_jobs', existingColumns, 'credit_cost', 'INTEGER DEFAULT 0');
  ensureColumn('generation_jobs', existingColumns, 'credits_reserved', 'INTEGER DEFAULT 0');
  ensureColumn('generation_jobs', existingColumns, 'credits_refunded', 'INTEGER DEFAULT 0');

  db.exec('UPDATE generation_jobs SET credit_cost = 0 WHERE credit_cost IS NULL');
  db.exec('UPDATE generation_jobs SET credits_reserved = 0 WHERE credits_reserved IS NULL');
  db.exec('UPDATE generation_jobs SET credits_refunded = 0 WHERE credits_refunded IS NULL');
}

function migrate(): void {
  console.log('Running SQLite database migrations...');

  try {
    // Execute the entire migration script at once
    db.exec(migrations);
  } catch (error) {
    // Check if it's just "already exists" errors
    const errorMsg = String(error);
    if (errorMsg.includes('already exists')) {
      console.log('Tables already exist, migrations completed!');
    } else {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  ensureProductColumns();
  ensureGenerationJobColumns();
  console.log('Migrations completed successfully!');
}

// Run migrations
migrate();
