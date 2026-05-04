import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { config } from '../config/index.js';

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((value) => path.resolve(value))));
}

function storageRoots(): string[] {
  return uniquePaths([
    config.storage.audioDir,
    path.resolve(process.cwd(), 'public/audio'),
  ]);
}

function localStorageKey(value: string): string | null {
  if (value.startsWith('/audio/')) {
    return value.slice('/audio/'.length);
  }

  if (value.startsWith('http')) {
    try {
      const parsed = new URL(value);
      if (parsed.pathname.startsWith('/audio/')) {
        return parsed.pathname.slice('/audio/'.length);
      }
    } catch {
      return null;
    }
  }

  const normalized = value.replace(/\\/g, '/');
  const publicAudioIndex = normalized.indexOf('public/audio/');
  if (publicAudioIndex >= 0) {
    return normalized.slice(publicAudioIndex + 'public/audio/'.length);
  }

  if (!path.isAbsolute(value) && !value.startsWith('.')) {
    return value;
  }

  return null;
}

export function localAudioPathCandidates(value: string): string[] {
  const key = localStorageKey(value);
  if (!key) {
    return path.isAbsolute(value) ? [value] : [path.resolve(value)];
  }

  const decodedKey = decodeURIComponent(key.split('?')[0]).replace(/^\/+/, '');
  if (!decodedKey || decodedKey.includes('\0')) return [];

  return storageRoots()
    .map((root) => {
      const resolved = path.resolve(root, decodedKey);
      return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
    })
    .filter((value): value is string => Boolean(value));
}

export async function resolveLocalAudioFile(value: string): Promise<string | null> {
  for (const candidate of localAudioPathCandidates(value)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next known storage root
    }
  }
  return null;
}

export async function readLocalAudioFile(value: string): Promise<Buffer | null> {
  const filePath = await resolveLocalAudioFile(value);
  return filePath ? readFile(filePath) : null;
}
