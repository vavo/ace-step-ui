import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { describeFfmpegLookup, resolveFfmpegPath } from './ffmpeg.js';

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
  const ffmpegPath = resolveFfmpegPath();
  if (ffmpegPath) {
    console.log(`[Startup] ffmpeg found: ${ffmpegPath}`);
    return;
  }

  console.warn(`[Startup] ffmpeg was not found. FLAC/MP3 fallback, reference preparation, and video/audio tools may fail. ${describeFfmpegLookup()}`);
}

export function runStartupChecks(): void {
  assertWritableDirectory(config.storage.audioDir, 'AUDIO_DIR');
  assertWritableDirectory(path.dirname(config.database.path), 'DATABASE_PATH directory');
  warnIfFfmpegMissing();
}
