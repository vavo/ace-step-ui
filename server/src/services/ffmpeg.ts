import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

let cachedFfmpegPath: string | null | undefined;

function pathEntries(): string[] {
  return (process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function candidatePaths(): string[] {
  const explicit = [
    process.env.FFMPEG_PATH,
    process.env.FFMPEG_BIN,
    process.env.FFMPEG_BINARY,
  ];

  const aceStepPaths = [
    process.env.ACESTEP_PATH,
    config.acestep.path,
    '/workspace/ACE-Step-1.5',
    '/workspace/ace/ACE-Step-1.5',
  ]
    .filter(Boolean)
    .flatMap((acePath) => [
      path.join(acePath as string, '.venv/bin/ffmpeg'),
      path.join(acePath as string, 'venv/bin/ffmpeg'),
    ]);

  const common = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/conda/bin/ffmpeg',
    '/workspace/venv/bin/ffmpeg',
  ];

  const fromPath = pathEntries().map((entry) => path.join(entry, 'ffmpeg'));

  return Array.from(new Set([...explicit, ...aceStepPaths, ...common, ...fromPath].filter(Boolean) as string[]));
}

function executableWorks(command: string): boolean {
  const result = spawnSync(command, ['-version'], { stdio: 'ignore' });
  return result.status === 0;
}

export function resolveFfmpegPath(): string | null {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;

  for (const candidate of candidatePaths()) {
    if (!path.isAbsolute(candidate)) {
      if (executableWorks(candidate)) {
        cachedFfmpegPath = candidate;
        return candidate;
      }
      continue;
    }

    if (existsSync(candidate) && executableWorks(candidate)) {
      cachedFfmpegPath = candidate;
      return candidate;
    }
  }

  cachedFfmpegPath = null;
  return null;
}

export function describeFfmpegLookup(): string {
  return [
    'Set FFMPEG_PATH=/absolute/path/to/ffmpeg if ffmpeg is installed outside Node PATH.',
    `Checked ACESTEP_PATH=${process.env.ACESTEP_PATH || config.acestep.path || '(unset)'}.`,
  ].join(' ');
}
