import { spawnSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

function assertWritableDirectory(dir: string, label: string): void {
  mkdirSync(dir, { recursive: true });

  const probePath = path.join(dir, `.acestep-write-test-${process.pid}-${Date.now()}`);
  try {
    writeFileSync(probePath, 'ok');
  } finally {
    try {
      unlinkSync(probePath);
    } catch {
      // ignore cleanup failures; the write check already did the useful work
    }
  }

  console.log(`[Startup] ${label} writable: ${dir}`);
}

function warnIfFfmpegMissing(): void {
  const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (result.status === 0) return;

  console.warn('[Startup] ffmpeg was not found on PATH. FLAC/MP3 fallback, reference preparation, and video/audio tools may fail.');
}

export function runStartupChecks(): void {
  assertWritableDirectory(config.storage.audioDir, 'AUDIO_DIR');
  assertWritableDirectory(path.dirname(config.database.path), 'DATABASE_PATH directory');
  warnIfFfmpegMissing();
}
