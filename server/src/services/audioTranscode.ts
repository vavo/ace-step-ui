import { spawn } from 'node:child_process';
import { describeFfmpegLookup, resolveFfmpegPath } from './ffmpeg.js';

async function transcode(input: Buffer, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      reject(new Error(`ffmpeg not found. ${describeFfmpegLookup()}`));
      return;
    }

    const ffmpeg = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    ffmpeg.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    ffmpeg.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }

      reject(new Error(`ffmpeg failed (${code}): ${Buffer.concat(stderr).toString('utf8')}`));
    });

    ffmpeg.stdin.end(input);
  });
}

export async function transcodeToMp3(input: Buffer): Promise<Buffer> {
  return transcode(input, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn',
      '-f', 'mp3',
      '-codec:a', 'libmp3lame',
      '-b:a', '192k',
      'pipe:1',
  ]);
}

export async function transcodeToWav(input: Buffer): Promise<Buffer> {
  return transcode(input, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-vn',
    '-f', 'wav',
    '-codec:a', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    'pipe:1',
  ]);
}
