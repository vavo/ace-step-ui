import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import { generateUUID } from '../db/sqlite.js';
import { config } from '../config/index.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getGradioClient } from '../services/gradio-client.js';
import {
  generateMusicViaAPI,
  getJobStatus,
  getAudioStream,
  discoverEndpoints,
  checkSpaceHealth,
  cleanupJob,
  getJobRawResponse,
  downloadAudioToBuffer,
  resolvePythonPath,
} from '../services/acestep.js';
import { getStorageProvider } from '../services/storage/factory.js';
import { isGradioAvailable } from '../services/gradio-client.js';
import {
  calculateGenerationCreditCost,
  getCreditSummary,
  InsufficientCreditsError,
  refundCredits,
  reserveCredits,
} from '../services/credits.js';
import { recordPublishedSong } from '../services/gamification.js';
import { transcodeToMp3 } from '../services/audioTranscode.js';

const router = Router();

type GeminiFormatInput = {
  caption: string;
  lyrics?: string;
  bpm?: number;
  duration?: number;
  keyScale?: string;
  timeSignature?: string;
  temperature?: number;
  topK?: number;
  topP?: number;
};

type GeminiFormatResult = {
  caption?: string;
  lyrics?: string;
  bpm?: number;
  duration?: number;
  key_scale?: string;
  time_signature?: string;
  vocal_language?: string;
};

type FormatProvider = 'openai' | 'gemini';

type RandomDescriptionResult = {
  description: string;
  instrumental: boolean;
  vocalLanguage: string;
  fallback: boolean;
  error?: string;
};

const DEFAULT_GENERATION_LIMITS = {
  tier: 'unknown',
  gpu_memory_gb: 0,
  max_duration_with_lm: 240,
  max_duration_without_lm: 240,
  max_batch_size_with_lm: 1,
  max_batch_size_without_lm: 4,
  fallback: true,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function isStorageExhaustedError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const message = errorMessage(error);
  return code === 'SQLITE_IOERR_WRITE'
    || code === 'SQLITE_FULL'
    || code === 'ENOSPC'
    || /disk i\/o error|disk quota exceeded|no space left on device/i.test(message);
}

function isIncompleteAceStepModelError(message: string): boolean {
  return /No \.safetensors files found|no file named .*model\.safetensors|failed to download|Disk quota exceeded/i.test(message);
}

const RANDOM_DESCRIPTION_FALLBACKS = [
  'A mellow lo-fi chill track with soft piano chords and warm ambient pads.',
  'An energetic 80s-inspired synthwave song with nostalgic arpeggios and punchy drums.',
  'A cinematic emotional build-up with epic strings, deep bass, and delayed piano melody.',
  'A relaxed lo-fi hip hop beat with vinyl crackle, mellow bassline, and jazzy keys.',
  'A dynamic club-ready house track with bright leads and a steady four-on-the-floor groove.',
  'A dreamy ambient pop song with airy vocals, reverb-heavy guitar, and sparse percussion.',
];

function getRandomDescriptionFallback(): Omit<RandomDescriptionResult, 'fallback' | 'error'> {
  const idx = Math.floor(Math.random() * RANDOM_DESCRIPTION_FALLBACKS.length);
  return {
    description: RANDOM_DESCRIPTION_FALLBACKS[idx],
    instrumental: false,
    vocalLanguage: 'en',
  };
}

async function resolveGradioRandomDescription(): Promise<RandomDescriptionResult> {
  const fallback = getRandomDescriptionFallback();
  const errorPrefix = 'Random description unavailable. Falling back to built-in suggestions.';

  let client: Awaited<ReturnType<typeof getGradioClient>>;
  try {
    client = await getGradioClient();
  } catch (error) {
    console.error('Random description: failed to connect to Gradio client:', error);
    return {
      ...fallback,
      fallback: true,
      error: error instanceof Error ? `${errorPrefix} ${error.message}` : `${errorPrefix} Unknown client error.`,
    };
  }

  const candidates = [
    '/load_random_simple_description',
    '/load_random_description',
    '/random_simple_description',
    '/random-description',
  ];

  let lastError: unknown;
  let usedEndpoint = '';
  for (const endpoint of candidates) {
    try {
      usedEndpoint = endpoint;
      const result = await (client as any).predict(endpoint, []);
      const data = (result as any)?.data as unknown[] | undefined;
      if (!Array.isArray(data) || data.length < 3) {
        lastError = new Error(`Endpoint ${endpoint} returned unexpected payload.`);
        continue;
      }

      return {
        description: (data[0] as string) || getRandomDescriptionFallback().description,
        instrumental: Boolean(data[1]),
        vocalLanguage: (data[2] as string) || 'unknown',
        fallback: false,
      };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  const isReady = await isGradioAvailable().catch(() => false);
  if (!isReady) {
    return {
      ...fallback,
      fallback: true,
      error: `${errorPrefix} Gradio app is not available.`,
    };
  }

  if (lastError instanceof Error) {
    const detail = usedEndpoint
      ? `Endpoints ${candidates.join(', ')} were tried; last error on ${usedEndpoint}: ${lastError.message}`
      : `All candidate endpoints failed: ${lastError.message}`;
    return {
      ...fallback,
      fallback: true,
      error: detail,
    };
  }

  return {
    ...fallback,
    fallback: true,
    error: `${errorPrefix} Gradio app is available but no compatible endpoint was found.`,
  };
}

function parseGeminiJson(text: string): GeminiFormatResult | null {
  if (!text) return null;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    const parsed = JSON.parse(text.slice(first, last + 1));
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      caption: typeof parsed.caption === 'string' ? parsed.caption : undefined,
      lyrics: typeof parsed.lyrics === 'string' ? parsed.lyrics : undefined,
      bpm: typeof parsed.bpm === 'number' && Number.isFinite(parsed.bpm) ? parsed.bpm : undefined,
      duration: typeof parsed.duration === 'number' && Number.isFinite(parsed.duration) ? parsed.duration : undefined,
      key_scale: typeof parsed.key_scale === 'string' ? parsed.key_scale : undefined,
      time_signature: parsed.time_signature ? String(parsed.time_signature) : undefined,
      vocal_language: typeof parsed.vocal_language === 'string' ? parsed.vocal_language : undefined,
    };
  } catch (error) {
    console.error('[Format] Could not parse Gemini response JSON:', error);
    return null;
  }
}

type CaptionOutputLanguage = 'en' | 'sk' | 'cs';

function captionLanguageLabel(language: CaptionOutputLanguage): string {
  switch (language) {
    case 'sk':
      return 'Slovak';
    case 'cs':
      return 'Czech';
    default:
      return 'English';
  }
}

function buildFormatPrompt(input: GeminiFormatInput): string {
  const captionLanguage = inferCaptionOutputLanguage(input);
  return `
You improve ACE-Step music generation prompts.
Return ONLY JSON with keys: caption, lyrics, bpm, duration, key_scale, time_signature, vocal_language.

Hard rules:
- Return "caption" in ${captionLanguageLabel(captionLanguage)}. Keep genre names like jungle, drum and bass, trap, techno, LoRA, BPM, CFG, Top-K unchanged when they are natural technical terms.
- The "caption" is shown to the user as the song about text, so keep it natural and user-facing.
- Preserve the user's explicit genre, style, language, vocal gender, vocal tone, mood/emotion, BPM, key, time signature, and instrumentation.
- Do not replace the requested genre with another genre or add novelty genres/effects not requested by the user.
- Do not turn a vocal song request into an instrumental unless the user explicitly asks for instrumental.
- If the user asks for a language, set vocal_language to the correct short code when possible (sk, cs, en, de, fr, es, pl, uk) and keep that language in the caption.
- If the user asks for a vocal gender or vocal tone (for example female, male, raspy, hoarse, soft, powerful), keep it in the caption.
- If the user asks for a genre (for example jungle, rock, pop, hip hop, trap, house, techno, metal, punk, folk), keep that genre in the caption.
- If lyrics are provided, polish them without changing their language or meaning.
- If lyrics are not provided and the user did not ask for instrumental music, generate complete original lyrics from the caption with clear verse/chorus structure.
- Prefer Slovak lyrics when the requested vocal language is Slovak or the caption is Slovak.
- Return reasonable bpm/duration only when implied by the genre or request.

Input:
Caption: ${input.caption}
Lyrics: ${input.lyrics || 'N/A'}
Requested BPM: ${input.bpm || 'N/A'}
Requested Duration: ${input.duration || 'N/A'}
Key: ${input.keyScale || 'N/A'}
Time signature: ${input.timeSignature || 'N/A'}
Temperature: ${input.temperature ?? 0.85}
Top-k: ${input.topK || 'N/A'}
Top-p: ${input.topP || 'N/A'}
`.trim();
}

function normalizeIntentText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

const FORMAT_SYSTEM_PROMPT = `
You are a strict music prompt formatter for an AI music generator.
Your job is to improve the user's prompt, not reinterpret it.

Rules:
- Preserve every explicit user constraint: genre, subgenre, language, vocal gender, vocal tone, mood/emotion, BPM, key, time signature, duration, instrumentation, and vocal vs instrumental intent.
- Never replace a requested genre with a different genre.
- Never turn a vocal request into an instrumental request unless the user explicitly asks for instrumental.
- Return the user-facing caption in the same language as the user's caption unless the user explicitly asks for another caption language.
- For Slovak or Czech input, keep the caption/about text in Slovak or Czech. Keep natural genre names and technical terms unchanged.
- If lyrics are missing and the user did not ask for instrumental music, generate complete original lyrics that match the requested caption, language, mood, and genre.
- Never add novelty concepts, meme elements, sound effects, or unrelated instruments unless the user asks for them.
- If the user writes in Slovak/Czech or requests Slovak/Czech vocals, preserve that language request.
- If the user specifies vocal gender or tone, keep it in the caption.
- If a parameter is not specified, you may infer a reasonable value, but do not override specified values.
- Return only valid JSON matching the requested schema.
`.trim();

type IntentRule = {
  label: string;
  phrase: string;
  patterns: RegExp[];
  conflicts?: RegExp[];
};

type LanguageIntent = {
  code: string;
  label: string;
  patterns: RegExp[];
};

type ExtractedFormatIntent = {
  source: string;
  genres: IntentRule[];
  language?: LanguageIntent;
  vocalGender?: 'male' | 'female';
  vocalToneRules: IntentRule[];
  moodRules: IntentRule[];
  bpm?: number;
  duration?: number;
  keyScale?: string;
  timeSignature?: string;
  mustBeVocal: boolean;
  instrumental: boolean;
};

const GENRE_RULES: IntentRule[] = [
  {
    label: 'hard techno',
    phrase: 'hard techno track with relentless industrial kick drums, distorted rumble bass, tense rave stabs, and high-pressure warehouse energy',
    patterns: [/hard\s+techno/, /tvrde\s+techno/, /tvrd[yae]\s+techno/],
    conflicts: [/\bslow\b/, /pomal/, /\bchiptune\b/, /\b8-bit\b/, /8bit/, /video\s*game/, /\bmeme\b/, /\bklezmer\b/, /\bbalkan\b/, /\baccordion\b/],
  },
  {
    label: 'jungle / drum and bass',
    phrase: 'jungle / drum and bass song with fast breakbeats, rolling sub-bass, syncopated percussion, and atmospheric pads',
    patterns: [/\bjungle\b/, /\bdnb\b/, /drum\s*(and|&)\s*bass/],
    conflicts: [/\bchiptune\b/, /\b8-bit\b/, /8bit/, /video\s*game/, /\bmeme\b/, /computer\s+error/, /text-to-speech/, /\btrap\b/, /\bklezmer\b/, /\bbalkan\b/, /\baccordion\b/],
  },
  {
    label: 'rock',
    phrase: 'rock song with guitar-driven arrangement, punchy live drums, bass guitar, and a strong chorus hook',
    patterns: [/\brock\b/, /rockov/, /rock song/],
    conflicts: [/\bchiptune\b/, /\b8-bit\b/, /8bit/, /\btrap\b/, /\bklezmer\b/, /\bbalkan\b/, /\baccordion\b/, /video\s*game/, /\bmeme\b/],
  },
  {
    label: 'pop',
    phrase: 'pop song with polished production, memorable melodic hooks, and a clear chorus',
    patterns: [/\bpop\b/, /popov/],
  },
  {
    label: 'hip hop',
    phrase: 'hip hop track with a tight beat, deep low end, rhythmic vocal flow, and modern production',
    patterns: [/\bhip\s*hop\b/, /\bhip-hop\b/, /\brap\b/, /\brapov/],
  },
  {
    label: 'trap',
    phrase: 'trap track with sharp hi-hats, heavy 808 bass, sparse drums, and moody modern production',
    patterns: [/\btrap\b/, /trapov/],
  },
  {
    label: 'house',
    phrase: 'house track with a four-on-the-floor groove, warm bassline, and club-ready energy',
    patterns: [/\bhouse\b/, /housov/],
  },
  {
    label: 'techno',
    phrase: 'techno track with a driving kick, hypnotic synths, and warehouse energy',
    patterns: [/\btechno\b/, /technov/],
  },
  {
    label: 'metal',
    phrase: 'metal song with heavy distorted guitars, aggressive drums, and intense vocal delivery',
    patterns: [/\bmetal\b/, /metalov/],
  },
  {
    label: 'punk',
    phrase: 'punk song with raw guitars, fast drums, direct vocals, and rebellious energy',
    patterns: [/\bpunk\b/, /punkov/],
  },
  {
    label: 'folk',
    phrase: 'folk song with organic acoustic instrumentation, intimate storytelling, and natural dynamics',
    patterns: [/\bfolk\b/, /folkov/],
  },
  {
    label: 'chiptune',
    phrase: 'chiptune track with 8-bit synth textures, retro video game energy, and playful melodic hooks',
    patterns: [/\bchiptune\b/, /\b8-bit\b/, /8bit/, /video\s*game/],
  },
];

const LANGUAGE_RULES: LanguageIntent[] = [
  { code: 'sk', label: 'Slovak', patterns: [/slovak/, /slovenc/, /slovencin/, /slovencine/, /slovensky/] },
  { code: 'cs', label: 'Czech', patterns: [/czech/, /cesk/, /cestin/, /cestine/, /cesky/] },
  { code: 'en', label: 'English', patterns: [/english/, /anglick/, /anglictin/] },
  { code: 'de', label: 'German', patterns: [/german/, /deutsch/, /nemeck/] },
  { code: 'fr', label: 'French', patterns: [/french/, /francuz/, /francais/] },
  { code: 'es', label: 'Spanish', patterns: [/spanish/, /spaniel/, /espanol/] },
  { code: 'pl', label: 'Polish', patterns: [/polish/, /polsk/] },
  { code: 'uk', label: 'Ukrainian', patterns: [/ukrain/, /ukrajinsk/] },
];

const VOCAL_TONE_RULES: IntentRule[] = [
  { label: 'raspy / hoarse', phrase: 'raspy, hoarse vocal tone', patterns: [/raspy/, /hoarse/, /husk/, /zachrip/, /chraplav/, /chraplavy/] },
  { label: 'soft', phrase: 'soft intimate vocal tone', patterns: [/soft/, /jemn/, /nezny/, /nezna/] },
  { label: 'powerful', phrase: 'powerful expressive vocal tone', patterns: [/powerful/, /strong vocal/, /siln/, /vyrazn/, /skvel/] },
  { label: 'emotional', phrase: 'emotional vocal delivery', patterns: [/emotional/, /emocn/, /citliv/, /smutn/] },
];

const MOOD_RULES: IntentRule[] = [
  { label: 'sad', phrase: 'sad emotional mood', patterns: [/sad/, /smutn/, /melanchol/] },
  { label: 'dark', phrase: 'dark tense mood', patterns: [/dark/, /temn/, /ponur/] },
  { label: 'happy', phrase: 'happy uplifting mood', patterns: [/happy/, /vesel/, /stastn/, /radost/] },
  { label: 'energetic', phrase: 'energetic high-impact mood', patterns: [/energetic/, /energick/, /vysoka energia/, /high energy/] },
  { label: 'romantic', phrase: 'romantic intimate mood', patterns: [/romantic/, /romantick/, /laska/, /love song/] },
  { label: 'angry', phrase: 'angry aggressive mood', patterns: [/angry/, /nahnevan/, /agresiv/, /zlost/] },
];

function matchingRules(text: string, rules: IntentRule[]): IntentRule[] {
  return rules.filter(rule => includesAny(text, rule.patterns));
}

function matchingLanguage(text: string): LanguageIntent | undefined {
  return LANGUAGE_RULES.find(rule => includesAny(text, rule.patterns));
}

function inferCaptionOutputLanguage(input: GeminiFormatInput): CaptionOutputLanguage {
  const rawSource = `${input.caption}\n${input.lyrics || ''}`;
  const source = normalizeIntentText(rawSource);
  const explicitLanguage = matchingLanguage(source);
  if (explicitLanguage?.code === 'sk' || explicitLanguage?.code === 'cs') return explicitLanguage.code;

  const hasSlovakDiacritics = /[áäčďéíĺľňóôŕšťúýž]/i.test(rawSource);
  const hasSlovakWords = includesAny(source, [
    /\b(chcem|spravit|urobit|pesnicku|piesen|skladbu|slovensk\w*|zensky\w*|zenskym|muzsky\w*|muzskym|hlasom|vokalom|textom|refr[eé]n|sloha|laska|zivot)\b/,
  ]);

  if (hasSlovakDiacritics || hasSlovakWords) return 'sk';
  return 'en';
}

function parseBpm(text: string, explicitBpm?: number): number | undefined {
  if (Number.isFinite(explicitBpm) && explicitBpm && explicitBpm > 0) return Math.round(explicitBpm);
  const match = text.match(/\b([6-9]\d|1\d{2}|2[0-4]\d|250)\s*bpm\b/);
  return match ? Number(match[1]) : undefined;
}

function extractFormatIntent(input: GeminiFormatInput): ExtractedFormatIntent {
  const source = normalizeIntentText(`${input.caption}\n${input.lyrics || ''}`);
  const language = matchingLanguage(source);
  const vocalToneRules = matchingRules(source, VOCAL_TONE_RULES);
  const vocalGender = includesAny(source, [/female\s+vocal/, /female\s+voice/, /woman\s+vocal/, /women\s+vocal/, /zensky/, /zenskym/, /zena/, /dievca/, /girl/])
    ? 'female'
    : includesAny(source, [/male\s+vocal/, /male\s+voice/, /man\s+vocal/, /muzsk/, /muzsky/, /chlap/, /chlapsk/, /boy/])
      ? 'male'
      : undefined;
  const instrumental = includesAny(source, [/\binstrumental\b/, /bez\s+vokal/, /bez\s+spevu/, /no\s+vocal/]);
  const mentionsVocal = includesAny(source, [/\bvocal/, /vokal/, /spev/, /hlas/]);

  return {
    source,
    genres: matchingRules(source, GENRE_RULES),
    language,
    vocalGender,
    vocalToneRules,
    moodRules: matchingRules(source, MOOD_RULES),
    bpm: parseBpm(source, input.bpm),
    duration: Number.isFinite(input.duration) && input.duration && input.duration > 0 ? Math.round(input.duration) : undefined,
    keyScale: input.keyScale,
    timeSignature: input.timeSignature,
    mustBeVocal: !instrumental && Boolean(language || vocalGender || vocalToneRules.length > 0 || mentionsVocal),
    instrumental,
  };
}

function buildIntentCaption(intent: ExtractedFormatIntent, originalCaption: string): string {
  const parts: string[] = [];
  const genrePhrase = intent.genres.length > 0
    ? intent.genres.map(genre => genre.phrase).join(', blended with ')
    : `music track based on this core user idea: "${originalCaption.trim()}"`;

  parts.push(`A ${genrePhrase}.`);

  if (intent.mustBeVocal) {
    const vocalParts = [
      ...intent.vocalToneRules.map(rule => rule.phrase),
      intent.vocalGender ? `${intent.vocalGender} lead vocal` : 'lead vocal',
      intent.language ? `in ${intent.language.label}` : '',
    ].filter(Boolean);
    parts.push(`Features ${vocalParts.join(', ')} with natural phrasing and clear presence in the mix.`);
  } else if (intent.instrumental) {
    parts.push('Instrumental arrangement with no lead vocal.');
  }

  if (intent.moodRules.length > 0) {
    parts.push(`Mood and emotion: ${intent.moodRules.map(rule => rule.phrase).join(', ')}.`);
  }

  parts.push('Do not add unrelated genres, novelty sound effects, meme elements, or instrumentation that contradicts the user request.');
  return parts.join(' ');
}

function buildSlovakIntentCaption(intent: ExtractedFormatIntent, originalCaption: string): string {
  const parts: string[] = [];
  const trimmedCaption = originalCaption.trim();
  const genreText = intent.genres.length > 0
    ? intent.genres.map(genre => genre.label).join(', ')
    : trimmedCaption;

  parts.push(`Vylepšený hudobný prompt podľa zadania: "${trimmedCaption}".`);
  parts.push(`Zachovaj štýl: ${genreText}.`);

  if (intent.mustBeVocal) {
    const vocalParts = [
      ...intent.vocalToneRules.map(rule => rule.label),
      intent.vocalGender === 'female' ? 'ženský hlavný vokál' : intent.vocalGender === 'male' ? 'mužský hlavný vokál' : 'hlavný vokál',
      intent.language?.code === 'sk' ? 'v slovenčine' : intent.language ? `v jazyku ${intent.language.label}` : '',
    ].filter(Boolean);
    parts.push(`Vokály: ${vocalParts.join(', ')} s prirodzeným frázovaním a jasným miestom v mixe.`);
  } else if (intent.instrumental) {
    parts.push('Inštrumentálna aranžmá bez hlavného vokálu.');
  }

  if (intent.moodRules.length > 0) {
    parts.push(`Nálada: ${intent.moodRules.map(rule => rule.label).join(', ')}.`);
  }

  parts.push('Nepridávaj nesúvisiace žánre, meme prvky, novelty zvuky ani nástroje, ktoré odporujú zadaniu.');
  return parts.join(' ');
}

function buildCzechIntentCaption(intent: ExtractedFormatIntent, originalCaption: string): string {
  const parts: string[] = [];
  const trimmedCaption = originalCaption.trim();
  const genreText = intent.genres.length > 0
    ? intent.genres.map(genre => genre.label).join(', ')
    : trimmedCaption;

  parts.push(`Vylepšený hudební prompt podle zadání: "${trimmedCaption}".`);
  parts.push(`Zachovej styl: ${genreText}.`);

  if (intent.mustBeVocal) {
    const vocalParts = [
      ...intent.vocalToneRules.map(rule => rule.label),
      intent.vocalGender === 'female' ? 'ženský hlavní vokál' : intent.vocalGender === 'male' ? 'mužský hlavní vokál' : 'hlavní vokál',
      intent.language?.code === 'cs' ? 'v češtině' : intent.language ? `v jazyce ${intent.language.label}` : '',
    ].filter(Boolean);
    parts.push(`Vokály: ${vocalParts.join(', ')} s přirozeným frázováním a jasným místem v mixu.`);
  } else if (intent.instrumental) {
    parts.push('Instrumentální aranžmá bez hlavního vokálu.');
  }

  if (intent.moodRules.length > 0) {
    parts.push(`Nálada: ${intent.moodRules.map(rule => rule.label).join(', ')}.`);
  }

  parts.push('Nepřidávej nesouvisející žánry, meme prvky, novelty zvuky ani nástroje, které odporují zadání.');
  return parts.join(' ');
}

function buildLocalizedIntentCaption(intent: ExtractedFormatIntent, originalCaption: string, language: CaptionOutputLanguage): string {
  if (language === 'sk') return buildSlovakIntentCaption(intent, originalCaption);
  if (language === 'cs') return buildCzechIntentCaption(intent, originalCaption);
  return buildIntentCaption(intent, originalCaption);
}

function looksLikeEnglishCaption(caption: string): boolean {
  const normalized = normalizeIntentText(caption);
  return includesAny(normalized, [
    /\b(song|track|with|features|female|male|vocals|lead vocal|clear presence|mix|mood|emotion|tempo|target duration|do not add|unrelated genres)\b/,
  ]);
}

function intentViolations(intent: ExtractedFormatIntent, result: GeminiFormatResult): string[] {
  const caption = normalizeIntentText(result.caption || '');
  const violations: string[] = [];

  for (const genre of intent.genres) {
    const genrePresent = includesAny(caption, genre.patterns);
    if (!genrePresent) violations.push(`missing genre: ${genre.label}`);

    for (const conflict of genre.conflicts || []) {
      if (conflict.test(caption) && !conflict.test(intent.source)) {
        violations.push(`conflicting style for ${genre.label}`);
        break;
      }
    }
  }

  if (intent.language) {
    const languagePresent = includesAny(caption, intent.language.patterns) || result.vocal_language === intent.language.code;
    if (!languagePresent) violations.push(`missing language: ${intent.language.label}`);
  }

  if (intent.vocalGender === 'female' && !includesAny(caption, [/female/, /woman/, /women/, /zensky/, /zensk/])) {
    violations.push('missing female vocal');
  }

  if (intent.vocalGender === 'male' && !includesAny(caption, [/male/, /man/, /men/, /muzsk/, /muzsky/, /chlapsk/])) {
    violations.push('missing male vocal');
  }

  for (const tone of intent.vocalToneRules) {
    if (!includesAny(caption, tone.patterns)) violations.push(`missing vocal tone: ${tone.label}`);
  }

  for (const mood of intent.moodRules) {
    if (!includesAny(caption, mood.patterns)) violations.push(`missing mood: ${mood.label}`);
  }

  if (intent.mustBeVocal && includesAny(caption, [/\binstrumental\b/, /no\s+vocal/, /without\s+vocals/])) {
    violations.push('turned vocal request into instrumental');
  }

  if (intent.bpm && result.bpm && Math.abs(result.bpm - intent.bpm) > 4) {
    violations.push('changed requested BPM');
  }

  return violations;
}

function preserveExplicitFormatIntent(input: GeminiFormatInput, result: GeminiFormatResult): GeminiFormatResult {
  const intent = extractFormatIntent(input);
  const violations = intentViolations(intent, result);
  const captionLanguage = inferCaptionOutputLanguage(input);
  let caption = result.caption || input.caption;

  if (violations.length > 0 || (captionLanguage !== 'en' && looksLikeEnglishCaption(caption))) {
    caption = buildLocalizedIntentCaption(intent, input.caption, captionLanguage);
  }

  return {
    ...result,
    caption,
    bpm: intent.bpm ?? result.bpm,
    duration: intent.duration ?? result.duration,
    key_scale: intent.keyScale ?? result.key_scale,
    time_signature: intent.timeSignature ?? result.time_signature,
    vocal_language: intent.language?.code ?? result.vocal_language,
  };
}

async function formatWithOpenAI(input: GeminiFormatInput): Promise<GeminiFormatResult | null> {
  const apiKey = config.openai.apiKey;
  if (!apiKey) return null;

  const payloadPrompt = buildFormatPrompt(input);

  try {
    const model = config.openai.model;
    const payload: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: FORMAT_SYSTEM_PROMPT },
        { role: 'user', content: payloadPrompt },
      ],
      response_format: { type: 'json_object' },
    };

    if (/\b(gpt-5|o[1-9]|o\d)/i.test(model)) {
      payload.reasoning_effort = config.openai.reasoningEffort;
      payload.max_completion_tokens = 700;
    } else {
      payload.temperature = input.temperature ?? 0.85;
      payload.top_p = input.topP ?? 0.95;
      payload.max_tokens = 700;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error('[Format] OpenAI API failed:', response.status, responseText.slice(0, 500));
      return null;
    }

    let responseJson: unknown;
    try {
      responseJson = JSON.parse(responseText);
    } catch (error) {
      console.error('[Format] Failed to parse OpenAI top-level response:', error);
      return null;
    }

    const parsedResponse = responseJson as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawText = parsedResponse?.choices?.[0]?.message?.content ?? '';
    return parseGeminiJson(typeof rawText === 'string' ? rawText : '');
  } catch (error) {
    console.error('[Format] OpenAI request failed:', error);
    return null;
  }
}

function getFormatProviders(): FormatProvider[] {
  const configured = config.format.provider || 'auto';
  const hasOpenAI = Boolean(config.openai.apiKey);
  const hasGemini = Boolean(config.gemini.apiKey);

  if (configured === 'openai') {
    return hasOpenAI ? ['openai'] : hasGemini ? ['gemini'] : [];
  }
  if (configured === 'gemini') {
    return hasGemini ? ['gemini'] : hasOpenAI ? ['openai'] : [];
  }

  const providers: FormatProvider[] = [];
  if (hasOpenAI) providers.push('openai');
  if (hasGemini) providers.push('gemini');
  return providers;
}

async function formatWithConfiguredProvider(input: GeminiFormatInput): Promise<GeminiFormatResult | null> {
  for (const provider of getFormatProviders()) {
    if (provider === 'openai') {
      const openAIResult = await formatWithOpenAI(input);
      if (openAIResult) return openAIResult;
      continue;
    }
    const geminiResult = await formatWithGemini(input);
    if (geminiResult) return geminiResult;
  }
  return null;
}

async function formatWithGemini(input: GeminiFormatInput): Promise<GeminiFormatResult | null> {
  const apiKey = config.gemini.apiKey;
  if (!apiKey) return null;

  const payloadPrompt = buildFormatPrompt(input);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: FORMAT_SYSTEM_PROMPT }],
        },
        contents: [{ parts: [{ text: payloadPrompt }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.85,
          topK: input.topK ?? 40,
          topP: input.topP ?? 0.95,
        },
      }),
      signal: AbortSignal.timeout(120000),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error('[Format] Gemini API failed:', response.status, responseText.slice(0, 500));
      return null;
    }

    let responseJson: unknown;
    try {
      responseJson = JSON.parse(responseText);
    } catch (error) {
      console.error('[Format] Failed to parse Gemini top-level response:', error);
      return null;
    }

    const parsedResponse = responseJson as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = parsedResponse?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseGeminiJson(typeof rawText === 'string' ? rawText : '');
  } catch (error) {
    console.error('[Format] Gemini request failed:', error);
    return null;
  }
}

// Auto-generate a song title from lyrics or style when none is provided
function autoTitle(params: { title?: string; lyrics?: string; instrumental?: boolean; style?: string; songDescription?: string }): string {
  if (params.title?.trim()) return params.title.trim();

  // Try first meaningful lyric line (skip section markers like [verse], [chorus])
  if (!params.instrumental && params.lyrics) {
    for (const line of params.lyrics.split('\n')) {
      const t = line.trim();
      if (t && !/^\[.*\]$/.test(t)) {
        return t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t;
      }
    }
  }

  // Fall back to first 4 words of style or description
  const source = params.style || params.songDescription || '';
  if (source) {
    const words = source.trim().split(/\s+/).slice(0, 4).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  return 'Untitled';
}

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3', // Alternative MIME type for MP3
      'audio/mpeg3',
      'audio/x-mpeg-3',
      'audio/wav',
      'audio/x-wav',
      'audio/flac',
      'audio/x-flac',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'video/mp4',
    ];

    // Also check file extension as fallback
    const allowedExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.mp4', '.aac', '.ogg', '.webm', '.opus'];
    const fileExt = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];

    if (allowedTypes.includes(file.mimetype) || (fileExt && allowedExtensions.includes(fileExt))) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only common audio formats are allowed. Received: ${file.mimetype} (${file.originalname})`));
    }
  }
});

interface GenerateBody {
  // Mode
  customMode: boolean;

  // Simple Mode
  songDescription?: string;

  // Custom Mode
  lyrics: string;
  style: string;
  title: string;

  // Common
  instrumental: boolean;
  vocalLanguage?: string;

  // Music Parameters
  duration?: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;

  // Generation Settings
  inferenceSteps?: number;
  guidanceScale?: number;
  batchSize?: number;
  randomSeed?: boolean;
  seed?: number;
  thinking?: boolean;
  audioFormat?: 'mp3' | 'flac' | 'wav';
  inferMethod?: 'ode' | 'sde';
  shift?: number;

  // LM Parameters
  lmTemperature?: number;
  lmCfgScale?: number;
  lmTopK?: number;
  lmTopP?: number;
  lmNegativePrompt?: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;

  // Model selection
  ditModel?: string;
  modelPreset?: 'fast' | 'quality' | 'advanced';
  strictMode?: boolean;
}

type LockedGenerationConstraints = {
  genres: string[];
  language?: string;
  vocalGender?: 'male' | 'female';
  vocalTone: string[];
  mood: string[];
  bpm?: number;
  duration?: number;
  keyScale?: string;
  timeSignature?: string;
  instrumental: boolean;
};

type CompiledGenerateBody = GenerateBody & {
  lockedConstraints?: LockedGenerationConstraints;
  promptCompiler?: {
    strictMode: boolean;
    originalCaption: string;
    compiledCaption: string;
    lockedConstraints: LockedGenerationConstraints;
  };
};

function hasExplicitGenerationIntent(intent: ExtractedFormatIntent): boolean {
  return Boolean(
    intent.genres.length > 0 ||
    intent.language ||
    intent.vocalGender ||
    intent.vocalToneRules.length > 0 ||
    intent.moodRules.length > 0 ||
    intent.bpm ||
    intent.duration ||
    intent.keyScale ||
    intent.timeSignature ||
    intent.instrumental ||
    intent.mustBeVocal
  );
}

function buildLockedConstraints(intent: ExtractedFormatIntent): LockedGenerationConstraints {
  return {
    genres: intent.genres.map(rule => rule.label),
    language: intent.language?.code,
    vocalGender: intent.vocalGender,
    vocalTone: intent.vocalToneRules.map(rule => rule.label),
    mood: intent.moodRules.map(rule => rule.label),
    bpm: intent.bpm,
    duration: intent.duration,
    keyScale: intent.keyScale,
    timeSignature: intent.timeSignature,
    instrumental: intent.instrumental,
  };
}

function defaultModelForPreset(preset: GenerateBody['modelPreset']): string {
  if (preset === 'fast') return 'acestep-v15-turbo';
  if (preset === 'advanced') return 'acestep-v15-base';
  return 'acestep-v15-sft';
}

function compileGenerationParams(input: GenerateBody): CompiledGenerateBody {
  const captionSource = (input.customMode ? (input.style || input.songDescription || '') : (input.songDescription || input.style || '')).trim();
  const lyricsSource = input.lyrics || '';
  const compilerCaption = captionSource || lyricsSource;
  const intent = extractFormatIntent({
    caption: compilerCaption,
    lyrics: lyricsSource,
    bpm: input.bpm,
    duration: input.duration,
    keyScale: input.keyScale,
    timeSignature: input.timeSignature,
  });
  const strictMode = Boolean(input.strictMode || hasExplicitGenerationIntent(intent));
  const captionLanguage = inferCaptionOutputLanguage({ caption: compilerCaption, lyrics: lyricsSource });
  const compiledCaption = strictMode && compilerCaption
    ? buildLocalizedIntentCaption(intent, compilerCaption, captionLanguage)
    : captionSource;
  const lockedConstraints = buildLockedConstraints(intent);
  const explicitMetadata = Boolean(intent.bpm || intent.duration || intent.keyScale || intent.timeSignature);
  const compiledInstrumental = intent.mustBeVocal ? false : Boolean(input.instrumental || intent.instrumental);
  lockedConstraints.instrumental = compiledInstrumental;
  const preset = input.modelPreset || 'quality';
  const ditModel = input.ditModel || defaultModelForPreset(preset);
  const turboModel = ditModel.includes('turbo');

  return {
    ...input,
    songDescription: input.customMode ? input.songDescription : (compiledCaption || input.songDescription),
    style: input.customMode ? (compiledCaption || input.style) : input.style,
    lyrics: lyricsSource,
    instrumental: compiledInstrumental,
    vocalLanguage: intent.language?.code || input.vocalLanguage,
    duration: intent.duration ?? input.duration,
    bpm: intent.bpm ?? input.bpm,
    keyScale: intent.keyScale || input.keyScale,
    timeSignature: intent.timeSignature || input.timeSignature,
    useCotMetas: explicitMetadata ? false : input.useCotMetas,
    useCotCaption: strictMode ? false : input.useCotCaption,
    useCotLanguage: intent.language ? false : input.useCotLanguage,
    ditModel,
    inferenceSteps: input.inferenceSteps ?? (turboModel ? 8 : 50),
    guidanceScale: input.guidanceScale ?? (turboModel ? 1 : 8),
    useAdg: input.useAdg ?? (preset === 'advanced' && ditModel.includes('base')),
    strictMode,
    lockedConstraints,
    promptCompiler: {
      strictMode,
      originalCaption: captionSource,
      compiledCaption,
      lockedConstraints,
    },
  };
}

router.post('/upload-audio', authMiddleware, (req: AuthenticatedRequest, res: Response, next: Function) => {
  audioUpload.single('audio')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Invalid file upload' });
      return;
    }
    next();
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Audio file is required' });
      return;
    }

    const storage = getStorageProvider();
    const extFromName = path.extname(req.file.originalname || '').toLowerCase();
    const extFromType = (() => {
      switch (req.file.mimetype) {
        case 'audio/mpeg':
          return '.mp3';
        case 'audio/wav':
        case 'audio/x-wav':
          return '.wav';
        case 'audio/flac':
        case 'audio/x-flac':
          return '.flac';
        case 'audio/ogg':
          return '.ogg';
        case 'audio/mp4':
        case 'audio/x-m4a':
        case 'audio/aac':
          return '.m4a';
        case 'audio/webm':
          return '.webm';
        case 'video/mp4':
          return '.mp4';
        default:
          return '';
      }
    })();
    const ext = extFromName || extFromType || '.audio';
    const key = `references/${req.user!.id}/${Date.now()}-${generateUUID()}${ext}`;
    const storedKey = await storage.upload(key, req.file.buffer, req.file.mimetype);
    const publicUrl = storage.getPublicUrl(storedKey);

    res.json({ url: publicUrl, key: storedKey });
  } catch (error) {
    console.error('Upload reference audio error:', error);
    res.status(500).json({ error: 'Failed to upload audio' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  let localJobId: string | null = null;
  let creditCost = 0;
  let creditsReserved = false;

  try {
    const {
      customMode,
      songDescription,
      lyrics,
      style,
      title,
      instrumental,
      vocalLanguage,
      duration,
      bpm,
      keyScale,
      timeSignature,
      inferenceSteps,
      guidanceScale,
      batchSize,
      randomSeed,
      seed,
      thinking,
      audioFormat,
      inferMethod,
      shift,
      lmTemperature,
      lmCfgScale,
      lmTopK,
      lmTopP,
      lmNegativePrompt,
      lmBackend,
      lmModel,
      referenceAudioUrl,
      sourceAudioUrl,
      referenceAudioTitle,
      sourceAudioTitle,
      audioCodes,
      repaintingStart,
      repaintingEnd,
      instruction,
      audioCoverStrength,
      taskType,
      useAdg,
      cfgIntervalStart,
      cfgIntervalEnd,
      customTimesteps,
      useCotMetas,
      useCotCaption,
      useCotLanguage,
      autogen,
      constrainedDecodingDebug,
      allowLmBatch,
      getScores,
      getLrc,
      scoreScale,
      lmBatchChunkSize,
      trackName,
      completeTrackClasses,
      isFormatCaption,
      ditModel,
      modelPreset,
      strictMode,
    } = req.body as GenerateBody;

    if (!customMode && !songDescription) {
      res.status(400).json({ error: 'Song description required for simple mode' });
      return;
    }

    if (customMode && !style && !lyrics && !referenceAudioUrl) {
      res.status(400).json({ error: 'Style, lyrics, or reference audio required for custom mode' });
      return;
    }

    const params = compileGenerationParams({
      customMode,
      songDescription,
      lyrics,
      style,
      title,
      instrumental,
      vocalLanguage,
      duration,
      bpm,
      keyScale,
      timeSignature,
      inferenceSteps,
      guidanceScale,
      batchSize,
      randomSeed,
      seed,
      thinking,
      audioFormat,
      inferMethod,
      shift,
      lmTemperature,
      lmCfgScale,
      lmTopK,
      lmTopP,
      lmNegativePrompt,
      lmBackend,
      lmModel,
      referenceAudioUrl,
      sourceAudioUrl,
      referenceAudioTitle,
      sourceAudioTitle,
      audioCodes,
      repaintingStart,
      repaintingEnd,
      instruction,
      audioCoverStrength,
      taskType,
      useAdg,
      cfgIntervalStart,
      cfgIntervalEnd,
      customTimesteps,
      useCotMetas,
      useCotCaption,
      useCotLanguage,
      autogen,
      constrainedDecodingDebug,
      allowLmBatch,
      getScores,
      getLrc,
      scoreScale,
      lmBatchChunkSize,
      trackName,
      completeTrackClasses,
      isFormatCaption,
      ditModel,
      modelPreset,
      strictMode,
    });

    creditCost = calculateGenerationCreditCost(params.batchSize);
    const creditSummary = getCreditSummary(req.user!.id);
    if (!creditSummary.unlimited && creditSummary.balance < creditCost) {
      res.status(402).json({
        error: 'Insufficient credits',
        creditBalance: creditSummary.balance,
        creditsRequired: creditCost,
      });
      return;
    }

    // Create job record in database
    localJobId = generateUUID();
    await pool.query(
      `INSERT INTO generation_jobs (id, user_id, status, params, credit_cost, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, ?, datetime('now'), datetime('now'))`,
      [localJobId, req.user!.id, JSON.stringify(params), creditCost]
    );

    reserveCredits({
      userId: req.user!.id,
      amount: creditCost,
      referenceType: 'generation_job',
      referenceId: localJobId,
      metadata: { batchSize: params.batchSize || 1 },
    });
    creditsReserved = true;

    await pool.query(
      `UPDATE generation_jobs SET credits_reserved = 1, updated_at = datetime('now') WHERE id = ?`,
      [localJobId]
    );

    // Start generation
    let hfJobId: string;
    try {
      const result = await generateMusicViaAPI(params);
      hfJobId = result.jobId;
    } catch (startError) {
      if (creditsReserved) {
        refundCredits({
          userId: req.user!.id,
          amount: creditCost,
          referenceType: 'generation_job',
          referenceId: localJobId,
          metadata: { reason: 'generation_start_failed' },
        });
        await pool.query(
          `UPDATE generation_jobs
           SET status = 'failed', error = ?, credits_refunded = 1, updated_at = datetime('now')
           WHERE id = ?`,
          [startError instanceof Error ? startError.message : 'Generation failed to start', localJobId]
        );
      }
      throw startError;
    }

    // Update job with ACE-Step task ID
    await pool.query(
      `UPDATE generation_jobs SET acestep_task_id = ?, status = 'running', updated_at = datetime('now') WHERE id = ?`,
      [hfJobId, localJobId]
    );

    res.json({
      jobId: localJobId,
      status: 'queued',
      queuePosition: 1,
      creditsReserved: creditCost,
    });
  } catch (error) {
    console.error('Generate error:', error);
    if (error instanceof InsufficientCreditsError) {
      res.status(402).json({
        error: error.message,
        creditBalance: error.balance,
        creditsRequired: error.required,
      });
      return;
    }
    if (isStorageExhaustedError(error)) {
      res.status(507).json({
        code: 'SERVER_STORAGE_FULL',
        error: 'Server storage is full. Free disk space or attach a larger volume, then restart ACE-Step and the app.',
      });
      return;
    }
    res.status(500).json({ error: errorMessage(error) || 'Generation failed' });
  }
});

router.get('/status/:jobId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const jobResult = await pool.query(
      `SELECT id, user_id, acestep_task_id, status, params, result, error, credit_cost, credits_reserved, credits_refunded, created_at
       FROM generation_jobs
       WHERE id = ?`,
      [req.params.jobId]
    );

    if (jobResult.rows.length === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const job = jobResult.rows[0];

    if (job.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // If job is still running, check ACE-Step status
    if (['pending', 'queued', 'running'].includes(job.status) && job.acestep_task_id) {
      try {
        const aceStatus = await getJobStatus(job.acestep_task_id);

        if (aceStatus.status !== job.status) {
          // Use optimistic lock: only update if status hasn't changed (prevents duplicate song creation)
          let updateQuery = `UPDATE generation_jobs SET status = ?, updated_at = datetime('now')`;
          const updateParams: unknown[] = [aceStatus.status];

          if (aceStatus.status === 'succeeded' && aceStatus.result) {
            updateQuery += `, result = ?`;
            updateParams.push(JSON.stringify(aceStatus.result));
          } else if (aceStatus.status === 'failed' && aceStatus.error) {
            updateQuery += `, error = ?`;
            updateParams.push(aceStatus.error);
          }

          updateQuery += ` WHERE id = ? AND status = ?`;
          updateParams.push(req.params.jobId, job.status);

          const updateResult = await pool.query(updateQuery, updateParams);
          const wasUpdated = updateResult.rowCount > 0;

          if (aceStatus.status === 'failed' && wasUpdated && job.credits_reserved && !job.credits_refunded && job.credit_cost > 0) {
            refundCredits({
              userId: req.user!.id,
              amount: job.credit_cost,
              referenceType: 'generation_job',
              referenceId: req.params.jobId,
              metadata: { reason: 'generation_failed' },
            });
            await pool.query(
              `UPDATE generation_jobs SET credits_refunded = 1, updated_at = datetime('now') WHERE id = ?`,
              [req.params.jobId]
            );
          }

          // If succeeded AND we were the first to update (optimistic lock), create song records
          if (aceStatus.status === 'succeeded' && aceStatus.result && wasUpdated) {
            const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
            const audioUrls = aceStatus.result.audioUrls.filter((url: string) => {
              const lower = url.toLowerCase();
              return lower.endsWith('.mp3') || lower.endsWith('.flac') || lower.endsWith('.wav');
            });
            const localPaths: string[] = [];
            const newBadges: ReturnType<typeof recordPublishedSong> = [];
            const storage = getStorageProvider();

            for (let i = 0; i < audioUrls.length; i++) {
              const audioUrl = audioUrls[i];
              const variationSuffix = audioUrls.length > 1 ? ` (v${i + 1})` : '';
              const songTitle = autoTitle(params) + variationSuffix;

              const songId = generateUUID();

              try {
                const { buffer } = await downloadAudioToBuffer(audioUrl);
                const sourceExt = audioUrl.includes('.wav') ? '.wav' : audioUrl.includes('.flac') ? '.flac' : '.mp3';
                let outputBuffer = buffer;
                let ext = sourceExt;

                if (sourceExt === '.flac') {
                  try {
                    outputBuffer = await transcodeToMp3(buffer);
                    ext = '.mp3';
                  } catch (transcodeError) {
                    console.error(`Failed to transcode generated FLAC ${i + 1} to MP3, storing original:`, transcodeError);
                  }
                }

                const storageKey = `${req.user!.id}/${songId}${ext}`;
                await storage.upload(storageKey, outputBuffer, ext === '.mp3' ? 'audio/mpeg' : `audio/${ext.slice(1)}`);
                const storedPath = storage.getPublicUrl(storageKey);

                await pool.query(
                  `INSERT INTO songs (id, user_id, title, lyrics, style, caption, audio_url,
                                      duration, bpm, key_scale, time_signature, tags, is_public, generation_params,
                                      created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
                  [
                    songId,
                    req.user!.id,
                    songTitle,
                    params.instrumental ? '[Instrumental]' : params.lyrics,
                    params.style,
                    params.style,
                    storedPath,
                    aceStatus.result.duration && aceStatus.result.duration > 0 ? aceStatus.result.duration : (params.duration && params.duration > 0 ? params.duration : 0),
                    aceStatus.result.bpm || params.bpm,
                    aceStatus.result.keyScale || params.keyScale,
                    aceStatus.result.timeSignature || params.timeSignature,
                    JSON.stringify([]),
                    JSON.stringify(params),
                  ]
                );

                newBadges.push(...recordPublishedSong(req.user!.id, songId));
                localPaths.push(storedPath);
              } catch (downloadError) {
                console.error(`Failed to download audio ${i + 1}:`, downloadError);
                // Still create song record with remote URL
                await pool.query(
                  `INSERT INTO songs (id, user_id, title, lyrics, style, caption, audio_url,
                                      duration, bpm, key_scale, time_signature, tags, is_public, generation_params,
                                      created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
                  [
                    songId,
                    req.user!.id,
                    songTitle,
                    params.instrumental ? '[Instrumental]' : params.lyrics,
                    params.style,
                    params.style,
                    audioUrl,
                    aceStatus.result.duration && aceStatus.result.duration > 0 ? aceStatus.result.duration : (params.duration && params.duration > 0 ? params.duration : 0),
                    aceStatus.result.bpm || params.bpm,
                    aceStatus.result.keyScale || params.keyScale,
                    aceStatus.result.timeSignature || params.timeSignature,
                    JSON.stringify([]),
                    JSON.stringify(params),
                  ]
                );
                newBadges.push(...recordPublishedSong(req.user!.id, songId));
                localPaths.push(audioUrl);
              }
            }

            aceStatus.result.audioUrls = localPaths;
            aceStatus.result.newBadges = newBadges;
            cleanupJob(job.acestep_task_id);
          }
        }

        res.json({
          jobId: req.params.jobId,
          status: aceStatus.status,
          queuePosition: aceStatus.queuePosition,
          etaSeconds: aceStatus.etaSeconds,
          progress: aceStatus.progress,
          stage: aceStatus.stage,
          result: aceStatus.result,
          newBadges: aceStatus.result?.newBadges || [],
          error: aceStatus.error,
        });
        return;
      } catch (aceError) {
        console.error('ACE-Step status check error:', aceError);
      }
    }

    // Return stored status
    res.json({
      jobId: req.params.jobId,
      status: job.status,
      progress: undefined,
      stage: undefined,
      result: job.result && typeof job.result === 'string' ? JSON.parse(job.result) : job.result,
      error: job.error,
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Audio proxy endpoint
router.get('/audio', async (req, res: Response) => {
  try {
    const audioPath = req.query.path as string;
    if (!audioPath) {
      res.status(400).json({ error: 'Path required' });
      return;
    }

    const audioResponse = await getAudioStream(audioPath);

    if (!audioResponse.ok) {
      res.status(audioResponse.status).json({ error: 'Failed to fetch audio' });
      return;
    }

    const contentType = audioResponse.headers.get('content-type');
    const wantsMp3 = req.query.format === 'mp3';
    const isFlac = /\.flac(?:$|\?)/i.test(audioPath) || Boolean(contentType?.includes('flac'));

    if (wantsMp3 || isFlac) {
      try {
        const arrayBuffer = await audioResponse.arrayBuffer();
        const mp3 = await transcodeToMp3(Buffer.from(arrayBuffer));
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', String(mp3.length));
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(mp3);
      } catch (error) {
        console.error('Audio MP3 fallback failed:', error);
        res.status(415).json({ error: 'Audio format is not supported and MP3 fallback failed' });
      }
      return;
    }

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const contentLength = audioResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const reader = audioResponse.body?.getReader();
    if (!reader) {
      res.status(500).json({ error: 'Failed to read audio stream' });
      return;
    }

    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      return pump();
    };

    await pump();
  } catch (error) {
    console.error('Audio proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, acestep_task_id, status, params, result, error, created_at
       FROM generation_jobs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user!.id]
    );

    res.json({ jobs: result.rows });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/endpoints', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const endpoints = await discoverEndpoints();
    res.json({ endpoints });
  } catch (error) {
    console.error('Discover endpoints error:', error);
    res.status(500).json({ error: 'Failed to discover endpoints' });
  }
});

router.get('/models', async (_req, res: Response) => {
  try {
    const ACESTEP_DIR = process.env.ACESTEP_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ACE-Step-1.5');
    const checkpointsDir = path.join(ACESTEP_DIR, 'checkpoints');

    // All known DiT models from Gradio's model_downloader.py registry:
    // - MAIN_MODEL_COMPONENTS includes "acestep-v15-turbo" (bundled with main download)
    // - SUBMODEL_REGISTRY includes the rest (separate HuggingFace repos, auto-downloaded on init)
    const ALL_DIT_MODELS = [
      'acestep-v15-turbo',             // default, from main model repo
      'acestep-v15-base',              // submodel
      'acestep-v15-sft',               // submodel
      'acestep-v15-xl-base',           // XL submodel
      'acestep-v15-xl-sft',            // XL submodel
      'acestep-v15-xl-turbo',          // XL submodel
      'acestep-v15-turbo-shift1',      // submodel
      'acestep-v15-turbo-shift3',      // submodel
      'acestep-v15-turbo-continuous',   // submodel
    ];
    const ALL_LM_MODELS = [
      'acestep-5Hz-lm-0.6B',
      'acestep-5Hz-lm-1.7B',
      'acestep-5Hz-lm-4B',
    ];

    // Query Gradio /v1/models to get the currently loaded/active model
    let activeModel: string | null = null;
    try {
      const apiRes = await fetch(`${config.acestep.apiUrl}/v1/models`);
      if (apiRes.ok) {
        const data = await apiRes.json() as any;
        const gradioModels = data?.data?.models || data?.models || [];
        if (gradioModels.length > 0) {
          activeModel = gradioModels[0]?.name || null;
        }
      }
    } catch {
      // Gradio API unavailable
    }

    // Check which models are downloaded (exist on disk)
    // Matches Gradio's handler.py check_model_exists() and get_available_acestep_v15_models()
    const { existsSync, statSync } = await import('fs');
    const downloaded = new Set<string>();
    for (const model of ALL_DIT_MODELS) {
      const modelPath = path.join(checkpointsDir, model);
      try {
        if (existsSync(modelPath) && statSync(modelPath).isDirectory()) {
          downloaded.add(model);
        }
      } catch { /* skip */ }
    }

    // Also scan for any additional acestep-v15-* models on disk not in the registry
    // (e.g. user-trained or community models)
    try {
      const { readdirSync } = await import('fs');
      for (const entry of readdirSync(checkpointsDir)) {
        if (entry.startsWith('acestep-v15-') && statSync(path.join(checkpointsDir, entry)).isDirectory()) {
          downloaded.add(entry);
          if (!ALL_DIT_MODELS.includes(entry)) {
            ALL_DIT_MODELS.push(entry);
          }
        }
      }
    } catch { /* checkpoints dir may not exist */ }

    const models = ALL_DIT_MODELS.map(name => ({
      name,
      is_active: name === activeModel,
      is_preloaded: downloaded.has(name),
    }));
    const lmModels = ALL_LM_MODELS.filter(name => {
      try {
        return existsSync(path.join(checkpointsDir, name)) && statSync(path.join(checkpointsDir, name)).isDirectory();
      } catch {
        return false;
      }
    });

    // Sort: active first, then downloaded, then alphabetical
    models.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.is_preloaded !== b.is_preloaded) return a.is_preloaded ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ models, lm: { available: lmModels.length > 0, models: lmModels } });
  } catch (error) {
    console.error('Models error:', error);
    res.json({
      models: [
        'acestep-v15-turbo',
        'acestep-v15-base',
        'acestep-v15-sft',
        'acestep-v15-xl-base',
        'acestep-v15-xl-sft',
        'acestep-v15-xl-turbo',
        'acestep-v15-turbo-shift1',
        'acestep-v15-turbo-shift3',
        'acestep-v15-turbo-continuous',
      ].map((name) => ({
        name,
        is_active: name === 'acestep-v15-turbo-shift3',
        is_preloaded: false,
      })),
      fallback: true,
      lm: { available: false, models: [] },
      error: error instanceof Error ? error.message : 'Failed to load models',
    });
  }
});

// GET /api/generate/random-description — Load a random simple description from Gradio
router.get('/random-description', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const randomDescription = await resolveGradioRandomDescription();
    const payload = {
      description: randomDescription.description,
      instrumental: randomDescription.instrumental,
      vocalLanguage: randomDescription.vocalLanguage,
      fallback: randomDescription.fallback,
    };
    if (randomDescription.error) {
      (payload as Record<string, unknown>).error = randomDescription.error;
    }
    res.json(payload);
  } catch (error) {
    const fallback = getRandomDescriptionFallback();
    console.error('Random description error:', error);
    res.json({
      description: fallback.description,
      instrumental: fallback.instrumental,
      vocalLanguage: fallback.vocalLanguage,
      fallback: true,
      error: error instanceof Error ? error.message : 'Unknown random description error',
    });
  }
});

router.get('/health', async (_req, res: Response) => {
  try {
    const healthy = await checkSpaceHealth();
    res.json({ healthy, aceStepUrl: config.acestep.apiUrl });
  } catch (error) {
    res.json({ healthy: false, aceStepUrl: config.acestep.apiUrl, error: (error as Error).message });
  }
});

router.get('/limits', async (_req, res: Response) => {
  try {
    const { spawn } = await import('child_process');
    const ACESTEP_DIR = process.env.ACESTEP_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ACE-Step-1.5');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
    const LIMITS_SCRIPT = path.join(SCRIPTS_DIR, 'get_limits.py');
    const pythonPath = resolvePythonPath(ACESTEP_DIR);

    const result = await new Promise<{ success: boolean; data?: any; error?: string }>((resolve) => {
      const proc = spawn(pythonPath, [LIMITS_SCRIPT], {
        cwd: ACESTEP_DIR,
        env: {
          ...process.env,
          ACESTEP_PATH: ACESTEP_DIR,
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          try {
            const parsed = JSON.parse(stdout);
            resolve({ success: true, data: parsed });
          } catch {
            resolve({ success: false, error: 'Failed to parse limits result' });
          }
        } else {
          resolve({ success: false, error: stderr || 'Failed to read limits' });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });

    if (result.success && result.data) {
      res.json(result.data);
    } else {
      res.json({
        ...DEFAULT_GENERATION_LIMITS,
        error: result.error || 'Failed to load limits',
      });
    }
  } catch (error) {
    console.error('Limits error:', error);
    res.json({
      ...DEFAULT_GENERATION_LIMITS,
      error: (error as Error).message,
    });
  }
});

router.get('/debug/:taskId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawResponse = getJobRawResponse(req.params.taskId);
    if (!rawResponse) {
      res.status(404).json({ error: 'Job not found or no raw response available' });
      return;
    }
    res.json({ rawResponse });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Format endpoint - uses LLM to enhance style/lyrics
router.post('/format', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { caption, lyrics, bpm, duration, keyScale, timeSignature, temperature, topK, topP, lmModel, lmBackend } = req.body;

    if (!caption) {
      res.status(400).json({ error: 'Caption/style is required' });
      return;
    }

    const ACESTEP_API_URL = config.acestep.apiUrl;

    // Build param_obj for the REST API
    const paramObj: Record<string, unknown> = {};
    if (bpm && bpm > 0) paramObj.bpm = bpm;
    if (duration && duration > 0) paramObj.duration = duration;
    if (keyScale) paramObj.key = keyScale;
    if (timeSignature) paramObj.time_signature = timeSignature;

    const providerInput = {
      caption,
      lyrics: lyrics || undefined,
      bpm: bpm,
      duration: duration,
      keyScale: keyScale || undefined,
      timeSignature: timeSignature || undefined,
      temperature: temperature,
      topK: topK,
      topP: topP,
    };

    // Primary path: use configured OpenAI/Gemini formatter with strict system instructions.
    const providerResult = await formatWithConfiguredProvider(providerInput);
    if (providerResult && (providerResult.caption || providerResult.lyrics)) {
      res.json(preserveExplicitFormatIntent(providerInput, providerResult));
      return;
    }

    // Fallback path: call ACE-Step's /format_input REST endpoint instead of spawning Python.
    try {
      console.log(`[Format] Calling REST API: ${ACESTEP_API_URL}/format_input`);
      const apiRes = await fetch(`${ACESTEP_API_URL}/format_input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: caption,
          lyrics: lyrics || '',
          temperature: temperature ?? 0.85,
          param_obj: paramObj,
        }),
        signal: AbortSignal.timeout(300_000), // 5 min — LLM may need to init first
      });

      const apiData = await apiRes.json() as any;

      if (!apiRes.ok || apiData.code !== 200) {
        const errMsg = apiData.error || apiData.detail || `Format API returned ${apiRes.status}`;
        console.error('[Format] API error:', errMsg);

        const fallbackResult = await formatWithConfiguredProvider(providerInput);

        if (fallbackResult && (fallbackResult.caption || fallbackResult.lyrics)) {
          res.json(preserveExplicitFormatIntent(providerInput, fallbackResult));
          return;
        }

        if (isIncompleteAceStepModelError(errMsg)) {
          res.status(503).json({
            success: false,
            code: 'ACESTEP_MODEL_INCOMPLETE',
            error: 'ACE-Step model download is incomplete. Free disk space, remove partial checkpoint folders, re-download the missing model files, then restart ACE-Step.',
            detail: errMsg,
          });
          return;
        }

        res.status(500).json({ success: false, error: errMsg });
        return;
      }

      const d = apiData.data;
      res.json(preserveExplicitFormatIntent(providerInput, {
        caption: d.caption,
        lyrics: d.lyrics,
        bpm: d.bpm,
        duration: d.duration,
        key_scale: d.key_scale,
        time_signature: d.time_signature,
        vocal_language: d.vocal_language,
      }));
      return;
    } catch (fetchErr: any) {
      const fallbackResult = await formatWithConfiguredProvider(providerInput);

      if (fallbackResult && (fallbackResult.caption || fallbackResult.lyrics)) {
        res.json(preserveExplicitFormatIntent(providerInput, fallbackResult));
        return;
      }

      // Only fall back to Python spawn on network errors (service not yet reachable)
      if (fetchErr?.name !== 'AbortError' && (fetchErr?.code === 'ECONNREFUSED' || fetchErr?.cause?.code === 'ECONNREFUSED')) {
        console.warn('[Format] REST API unreachable, falling back to Python spawn');
      } else {
        console.error('[Format] REST API request failed:', fetchErr?.message);
        res.status(500).json({ success: false, error: fetchErr?.message || 'Format request failed' });
        return;
      }
    }

    // Fallback: Python spawn (only reached when REST API is unreachable)
    const { spawn } = await import('child_process');
    const ACESTEP_DIR = process.env.ACESTEP_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ACE-Step-1.5');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
    const FORMAT_SCRIPT = path.join(SCRIPTS_DIR, 'format_sample.py');
    const pythonPath = resolvePythonPath(ACESTEP_DIR);

    const args = [FORMAT_SCRIPT, '--caption', caption, '--json'];
    if (lyrics) args.push('--lyrics', lyrics);
    if (bpm && bpm > 0) args.push('--bpm', String(bpm));
    if (duration && duration > 0) args.push('--duration', String(duration));
    if (keyScale) args.push('--key-scale', keyScale);
    if (timeSignature) args.push('--time-signature', timeSignature);
    if (temperature !== undefined) args.push('--temperature', String(temperature));
    if (topK && topK > 0) args.push('--top-k', String(topK));
    if (topP !== undefined) args.push('--top-p', String(topP));
    if (lmModel) args.push('--lm-model', lmModel);
    if (lmBackend) args.push('--lm-backend', lmBackend);

    console.log(`[Format] Fallback spawn: ${pythonPath} ${args.join(' ')}`);
    const result = await new Promise<{ success: boolean; data?: any; error?: string }>((resolve) => {
      const proc = spawn(pythonPath, args, {
        cwd: ACESTEP_DIR,
        env: { ...process.env, ACESTEP_PATH: ACESTEP_DIR },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          const lines = stdout.trim().split('\n');
          let jsonStr = '';
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].startsWith('{')) { jsonStr = lines[i]; break; }
          }
          try {
            const parsed = JSON.parse(jsonStr || stdout);
            resolve({ success: true, data: parsed });
          } catch {
            console.error('[Format] Failed to parse stdout:', stdout.slice(0, 500));
            resolve({ success: false, error: 'Failed to parse format result' });
          }
        } else {
          console.error(`[Format] Process exited with code ${code}`);
          if (stdout) console.error('[Format] stdout:', stdout.slice(0, 1000));
          if (stderr) console.error('[Format] stderr:', stderr.slice(0, 1000));
          resolve({ success: false, error: stderr || stdout || `Format process exited with code ${code}` });
        }
      });

      proc.on('error', (err) => {
        console.error('[Format] Spawn error:', err.message);
        resolve({ success: false, error: err.message });
      });
    });

    if (result.success && result.data) {
      res.json(preserveExplicitFormatIntent(providerInput, result.data));
    } else {
      console.error('[Format] Python error:', result.error);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[Format] Route error:', error);
    if (isStorageExhaustedError(error)) {
      res.status(507).json({
        code: 'SERVER_STORAGE_FULL',
        error: 'Server storage is full. Free disk space or attach a larger volume, then restart ACE-Step and the app.',
      });
      return;
    }
    res.status(500).json({ error: errorMessage(error) });
  }
});

export default router;
