import { config } from '../config/index.js';
import { buildStyleProfilePrompt, findStyleProfile, type GenerationPreset, type StyleProfile } from '../data/styleProfiles.js';

export type CaptionOutputLanguage = 'en' | 'sk' | 'cs';

export type PromptConstraintSet = {
  genres: string[];
  language?: string;
  vocalGender?: 'male' | 'female';
  vocalTone: string[];
  mood: string[];
  bpm?: number;
  duration?: number;
  keyScale?: string;
  timeSignature?: string;
  instrumentation: string[];
  avoid: string[];
  instrumental: boolean;
  mustBeVocal: boolean;
};

export type PromptConstraints = {
  source: string;
  explicit: PromptConstraintSet;
  inferred: {
    bpm?: number;
    keyScale?: string;
    timeSignature?: string;
    preset?: GenerationPreset;
  };
  stylePrompt: string;
  provider: 'openai' | 'fallback';
  warnings: string[];
};

export type PromptFormatInput = {
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

export type PromptFormatResult = {
  caption?: string;
  lyrics?: string;
  bpm?: number;
  duration?: number;
  key_scale?: string;
  time_signature?: string;
  vocal_language?: string;
};

export type LockedGenerationConstraints = {
  styleProfile?: string;
  genres: string[];
  language?: string;
  vocalGender?: 'male' | 'female';
  vocalTone: string[];
  mood: string[];
  bpm?: number;
  bpmRange?: [number, number];
  duration?: number;
  keyScale?: string;
  timeSignature?: string;
  instrumental: boolean;
  instrumentation: string[];
  avoid: string[];
};

type GoldenPromptCase = {
  name: string;
  input: string;
  expected: {
    genres?: string[];
    language?: string;
    vocalGender?: 'male' | 'female';
    vocalTone?: string[];
    mood?: string[];
    bpm?: number;
  };
};

export const GOLDEN_PROMPT_CASES: GoldenPromptCase[] = [
  {
    name: 'Slovak jungle female vocal',
    input: 'chcem jungle pesnicku so slovenskym zenskym vokalom',
    expected: { genres: ['jungle'], language: 'sk', vocalGender: 'female' as const },
  },
  {
    name: 'Czech raspy male rock',
    input: 'cesky zachripnuty muzsky vokal, rock song',
    expected: { genres: ['rock'], language: 'cs', vocalGender: 'male' as const, vocalTone: ['raspy'] },
  },
  {
    name: 'Hard techno tempo',
    input: 'hard techno, 150 bpm',
    expected: { genres: ['hard techno'], bpm: 150 },
  },
  {
    name: 'Slovak angry political rap',
    input: 'slovak political rap, angry, 88 bpm',
    expected: { genres: ['hip hop'], language: 'sk', mood: ['angry'], bpm: 88 },
  },
];

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function emptyConstraintSet(): PromptConstraintSet {
  return {
    genres: [],
    vocalTone: [],
    mood: [],
    instrumentation: [],
    avoid: [],
    instrumental: false,
    mustBeVocal: false,
  };
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    const key = normalizeText(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function mergeUnique(...groups: Array<string[] | undefined>): string[] {
  return uniqueStrings(groups.flatMap(group => group || []));
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeLanguageCode(value: unknown): string | undefined {
  const raw = stringOrUndefined(value)?.toLowerCase();
  if (!raw) return undefined;
  if (raw.startsWith('slovak') || raw === 'sk') return 'sk';
  if (raw.startsWith('czech') || raw === 'cs' || raw === 'cz') return 'cs';
  if (raw.startsWith('english') || raw === 'en') return 'en';
  if (raw.startsWith('german') || raw === 'de') return 'de';
  if (raw.startsWith('french') || raw === 'fr') return 'fr';
  if (raw.startsWith('spanish') || raw === 'es') return 'es';
  if (raw.startsWith('polish') || raw === 'pl') return 'pl';
  if (raw.startsWith('ukrain') || raw === 'uk') return 'uk';
  return raw.length <= 5 ? raw : undefined;
}

function detectLanguage(source: string): string | undefined {
  const text = normalizeText(source);
  if (/\b(slovak|slovenc|slovencin|slovencine|slovensky)\b/.test(text)) return 'sk';
  if (/\b(czech|cesk|cestin|cestine|cesky)\b/.test(text)) return 'cs';
  if (/\b(english|anglick|anglictin)\b/.test(text)) return 'en';
  if (/\b(german|deutsch|nemeck)\b/.test(text)) return 'de';
  if (/\b(french|francuz|francais)\b/.test(text)) return 'fr';
  if (/\b(spanish|spaniel|espanol)\b/.test(text)) return 'es';
  if (/\b(polish|polsk)\b/.test(text)) return 'pl';
  if (/\b(ukrain|ukrajinsk)\b/.test(text)) return 'uk';
  return undefined;
}

function detectVocalGender(source: string): 'male' | 'female' | undefined {
  const text = normalizeText(source);
  if (/\b(female|woman|women|girl|zensky|zenskym|zena|dievca)\b/.test(text)) return 'female';
  if (/\b(male|man|men|boy|muzsk|muzsky|chlap|chlapsk)\b/.test(text)) return 'male';
  return undefined;
}

function detectFallbackTone(source: string): string[] {
  const text = normalizeText(source);
  const tones: string[] = [];
  if (/\b(raspy|hoarse|husky|zachrip|chraplav|chraplavy)\b/.test(text)) tones.push('raspy / hoarse');
  if (/\b(soft|jemn|nezny|nezna)\b/.test(text)) tones.push('soft');
  if (/\b(powerful|strong vocal|siln|vyrazn|skvel)\b/.test(text)) tones.push('powerful');
  if (/\b(emotional|emocn|citliv)\b/.test(text)) tones.push('emotional');
  return tones;
}

function detectFallbackMood(source: string): string[] {
  const text = normalizeText(source);
  const moods: string[] = [];
  if (/\b(sad|smutn|melanchol)\b/.test(text)) moods.push('sad');
  if (/\b(dark|temn|ponur|horror)\b/.test(text)) moods.push('dark');
  if (/\b(happy|vesel|stastn|radost)\b/.test(text)) moods.push('happy');
  if (/\b(energetic|energick|high energy)\b/.test(text)) moods.push('energetic');
  if (/\b(romantic|romantick|laska|love song)\b/.test(text)) moods.push('romantic');
  if (/\b(angry|nahnevan|agresiv|zlost)\b/.test(text)) moods.push('angry');
  return moods;
}

function parseBpm(source: string, explicitBpm?: number): number | undefined {
  if (Number.isFinite(explicitBpm) && explicitBpm && explicitBpm > 0) return Math.round(explicitBpm);
  const match = normalizeText(source).match(/\b([6-9]\d|1\d{2}|2[0-4]\d|250)\s*bpm\b/);
  return match ? Number(match[1]) : undefined;
}

function hasSlovakSource(input: PromptFormatInput): boolean {
  const rawSource = `${input.caption}\n${input.lyrics || ''}`;
  const source = normalizeText(rawSource);
  return /[áäčďéíĺľňóôŕšťúýž]/i.test(rawSource)
    || /\b(chcem|spravit|urobit|pesnicku|piesen|skladbu|slovensk\w*|zensky\w*|zenskym|muzsky\w*|muzskym|hlasom|vokalom|textom|refr[eé]n|sloha|laska|zivot)\b/.test(source);
}

export function inferCaptionOutputLanguage(input: PromptFormatInput): CaptionOutputLanguage {
  const explicitLanguage = detectLanguage(`${input.caption}\n${input.lyrics || ''}`);
  if (explicitLanguage === 'sk' || explicitLanguage === 'cs') return explicitLanguage;
  return hasSlovakSource(input) ? 'sk' : 'en';
}

function coerceConstraintSet(value: unknown): PromptConstraintSet {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const vocalGenderRaw = stringOrUndefined(record.vocalGender);
  const language = normalizeLanguageCode(record.language);
  const vocalGender = vocalGenderRaw === 'male' || vocalGenderRaw === 'female' ? vocalGenderRaw : undefined;
  const instrumental = Boolean(record.instrumental);
  const mustBeVocal = Boolean(record.mustBeVocal || language || vocalGender || uniqueStrings(record.vocalTone).length > 0);

  return {
    genres: uniqueStrings(record.genres),
    language,
    vocalGender,
    vocalTone: uniqueStrings(record.vocalTone),
    mood: uniqueStrings(record.mood),
    bpm: numberOrUndefined(record.bpm),
    duration: numberOrUndefined(record.duration),
    keyScale: stringOrUndefined(record.keyScale),
    timeSignature: stringOrUndefined(record.timeSignature),
    instrumentation: uniqueStrings(record.instrumentation),
    avoid: uniqueStrings(record.avoid),
    instrumental,
    mustBeVocal: mustBeVocal && !instrumental,
  };
}

export function extractPromptConstraintsFallback(input: PromptFormatInput): PromptConstraints {
  const source = `${input.caption}\n${input.lyrics || ''}`;
  const normalized = normalizeText(source);
  const profile = findStyleProfile(source);
  const explicit = emptyConstraintSet();
  explicit.language = detectLanguage(source);
  explicit.vocalGender = detectVocalGender(source);
  explicit.vocalTone = detectFallbackTone(source);
  explicit.mood = detectFallbackMood(source);
  explicit.bpm = parseBpm(source, input.bpm);
  explicit.duration = numberOrUndefined(input.duration);
  explicit.keyScale = input.keyScale;
  explicit.timeSignature = input.timeSignature;
  explicit.instrumental = /\b(instrumental|bez\s+vokal|bez\s+spevu|no\s+vocal)\b/.test(normalized);
  explicit.mustBeVocal = !explicit.instrumental && Boolean(
    explicit.language ||
    explicit.vocalGender ||
    explicit.vocalTone.length > 0 ||
    /\b(vocal|vokal|spev|hlas)\b/.test(normalized)
  );
  if (profile) {
    explicit.genres = [profile.label];
    explicit.instrumentation = profile.instrumentation;
    explicit.avoid = profile.avoid;
  }

  const constraints: PromptConstraints = {
    source: normalized,
    explicit,
    inferred: {
      bpm: profile?.defaultBpm,
      keyScale: profile?.defaultKeyScale,
      timeSignature: profile?.timeSignature,
      preset: profile?.preferredPreset,
    },
    stylePrompt: '',
    provider: 'fallback',
    warnings: [],
  };
  constraints.stylePrompt = buildStylePromptFromConstraints(constraints, input.caption);
  return constraints;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    const parsed = JSON.parse(text.slice(first, last + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function buildConstraintExtractionPrompt(input: PromptFormatInput): string {
  return `
Extract music generation constraints from the user request.

Return ONLY JSON with exactly these keys:
{
  "explicit": {
    "genres": [],
    "language": null,
    "vocalGender": null,
    "vocalTone": [],
    "mood": [],
    "bpm": null,
    "duration": null,
    "keyScale": null,
    "timeSignature": null,
    "instrumentation": [],
    "avoid": [],
    "instrumental": false,
    "mustBeVocal": false
  },
  "inferred": {
    "bpm": null,
    "keyScale": null,
    "timeSignature": null,
    "preset": "quality"
  },
  "stylePrompt": ""
}

Rules:
- explicit means the user actually requested it. Do not invent explicit values.
- Unknown genres are valid. Preserve them as text in explicit.genres.
- If the user asks for a language, use short code such as sk, cs, en, de, fr, es, pl, uk.
- If the user asks for vocal gender, tone, mood, BPM, key, time signature, instrumentation, or things to avoid, capture them.
- If the user asks for vocals or a vocal language/gender/tone, set mustBeVocal true and instrumental false.
- inferred can use reasonable defaults for genre conventions only when not explicit.
- stylePrompt must preserve all explicit constraints and be concise, vivid, production-oriented, and suitable for ACE-Step.
- Do not translate genre names. Do not replace requested genres with unrelated genres.

Caption/style:
${input.caption}

Lyrics:
${input.lyrics || 'N/A'}

Provided params:
BPM: ${input.bpm || 'N/A'}
Duration: ${input.duration || 'N/A'}
Key: ${input.keyScale || 'N/A'}
Time signature: ${input.timeSignature || 'N/A'}
`.trim();
}

async function extractPromptConstraintsWithOpenAI(input: PromptFormatInput): Promise<PromptConstraints | null> {
  if (!config.openai.apiKey) return null;

  try {
    const model = config.openai.model;
    const payload: Record<string, unknown> = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a strict music constraint extractor. Return only valid JSON. Preserve explicit user constraints exactly; never reinterpret the requested genre.',
        },
        { role: 'user', content: buildConstraintExtractionPrompt(input) },
      ],
      response_format: { type: 'json_object' },
    };

    if (/\b(gpt-5|o[1-9]|o\d)/i.test(model)) {
      payload.reasoning_effort = config.openai.reasoningEffort;
      payload.max_completion_tokens = 1000;
    } else {
      payload.temperature = 0.1;
      payload.max_tokens = 1000;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error('[PromptCompiler] OpenAI extraction failed:', response.status, responseText.slice(0, 500));
      return null;
    }

    const responseJson = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
    const rawText = responseJson.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(rawText);
    if (!parsed) return null;

    const explicit = coerceConstraintSet(parsed.explicit);
    const inferredRaw = parsed.inferred && typeof parsed.inferred === 'object'
      ? parsed.inferred as Record<string, unknown>
      : {};
    const preset = stringOrUndefined(inferredRaw.preset);
    return {
      source: normalizeText(`${input.caption}\n${input.lyrics || ''}`),
      explicit,
      inferred: {
        bpm: numberOrUndefined(inferredRaw.bpm),
        keyScale: stringOrUndefined(inferredRaw.keyScale),
        timeSignature: stringOrUndefined(inferredRaw.timeSignature),
        preset: preset === 'fast' || preset === 'quality' || preset === 'advanced' ? preset : undefined,
      },
      stylePrompt: stringOrUndefined(parsed.stylePrompt) || '',
      provider: 'openai',
      warnings: [],
    };
  } catch (error) {
    console.error('[PromptCompiler] OpenAI extraction request failed:', error);
    return null;
  }
}

function mergeConstraintSets(ai: PromptConstraintSet, fallback: PromptConstraintSet): PromptConstraintSet {
  const language = fallback.language || ai.language;
  const vocalGender = fallback.vocalGender || ai.vocalGender;
  const vocalTone = mergeUnique(ai.vocalTone, fallback.vocalTone);
  const instrumental = Boolean((ai.instrumental || fallback.instrumental) && !(language || vocalGender || vocalTone.length > 0 || ai.mustBeVocal || fallback.mustBeVocal));
  return {
    genres: mergeUnique(ai.genres, fallback.genres),
    language,
    vocalGender,
    vocalTone,
    mood: mergeUnique(ai.mood, fallback.mood),
    bpm: fallback.bpm || ai.bpm,
    duration: fallback.duration || ai.duration,
    keyScale: fallback.keyScale || ai.keyScale,
    timeSignature: fallback.timeSignature || ai.timeSignature,
    instrumentation: mergeUnique(ai.instrumentation, fallback.instrumentation),
    avoid: mergeUnique(ai.avoid, fallback.avoid),
    instrumental,
    mustBeVocal: !instrumental && Boolean(ai.mustBeVocal || fallback.mustBeVocal || language || vocalGender || vocalTone.length > 0),
  };
}

function mergePromptConstraints(ai: PromptConstraints, fallback: PromptConstraints): PromptConstraints {
  return {
    source: fallback.source,
    explicit: mergeConstraintSets(ai.explicit, fallback.explicit),
    inferred: {
      bpm: fallback.inferred.bpm || ai.inferred.bpm,
      keyScale: fallback.inferred.keyScale || ai.inferred.keyScale,
      timeSignature: fallback.inferred.timeSignature || ai.inferred.timeSignature,
      preset: fallback.inferred.preset || ai.inferred.preset,
    },
    stylePrompt: ai.stylePrompt || fallback.stylePrompt,
    provider: 'openai',
    warnings: [],
  };
}

function languageLabel(code?: string): string {
  switch (code) {
    case 'sk': return 'Slovak';
    case 'cs': return 'Czech';
    case 'en': return 'English';
    case 'de': return 'German';
    case 'fr': return 'French';
    case 'es': return 'Spanish';
    case 'pl': return 'Polish';
    case 'uk': return 'Ukrainian';
    default: return code || '';
  }
}

function styleProfileForConstraints(source: string, constraints: PromptConstraints): StyleProfile | undefined {
  return findStyleProfile(`${source} ${constraints.explicit.genres.join(' ')}`);
}

export function buildStylePromptFromConstraints(constraints: PromptConstraints, originalCaption: string): string {
  const profile = styleProfileForConstraints(originalCaption, constraints);
  const explicit = constraints.explicit;
  const parts: string[] = [];

  if (profile) parts.push(buildStyleProfilePrompt(profile));
  if (explicit.genres.length > 0) {
    parts.push(`${explicit.genres.join(' / ')} production that preserves the requested genre exactly.`);
  } else if (originalCaption.trim()) {
    parts.push(`Music track based on this core user idea: "${originalCaption.trim()}".`);
  }

  if (explicit.mustBeVocal) {
    const vocalParts = [
      explicit.vocalGender ? `${explicit.vocalGender} lead vocal` : 'lead vocal',
      explicit.language ? `${languageLabel(explicit.language)} lyrics` : '',
      ...explicit.vocalTone,
    ].filter(Boolean);
    parts.push(`Vocals: ${vocalParts.join(', ')} with natural phrasing and clear presence in the mix.`);
  } else if (explicit.instrumental) {
    parts.push('Instrumental arrangement with no lead vocal.');
  }

  if (explicit.mood.length > 0) parts.push(`Mood: ${explicit.mood.join(', ')}.`);
  if (explicit.instrumentation.length > 0) parts.push(`Instrumentation: ${explicit.instrumentation.join(', ')}.`);
  if (explicit.avoid.length > 0) parts.push(`Avoid: ${explicit.avoid.join(', ')}.`);
  parts.push('Do not add unrelated genres, novelty sound effects, meme elements, or instrumentation that contradicts the user request.');

  return parts.join(' ');
}

export function validateStylePromptAgainstConstraints(constraints: PromptConstraints, stylePrompt: string): string[] {
  const prompt = normalizeText(stylePrompt);
  const violations: string[] = [];

  for (const genre of constraints.explicit.genres) {
    if (!prompt.includes(normalizeText(genre))) violations.push(`missing genre: ${genre}`);
  }

  if (constraints.explicit.language && constraints.explicit.mustBeVocal) {
    const label = normalizeText(languageLabel(constraints.explicit.language));
    if (label && !prompt.includes(label)) violations.push(`missing language: ${constraints.explicit.language}`);
  }

  if (constraints.explicit.vocalGender && !prompt.includes(constraints.explicit.vocalGender)) {
    violations.push(`missing vocal gender: ${constraints.explicit.vocalGender}`);
  }

  if (constraints.explicit.mustBeVocal && /\binstrumental\b|no vocal|without vocals/.test(prompt)) {
    violations.push('turned vocal request into instrumental');
  }

  return violations;
}

export async function extractPromptConstraints(input: PromptFormatInput): Promise<PromptConstraints> {
  const fallback = extractPromptConstraintsFallback(input);
  const ai = await extractPromptConstraintsWithOpenAI(input);
  const constraints = ai ? mergePromptConstraints(ai, fallback) : fallback;
  const violations = validateStylePromptAgainstConstraints(constraints, constraints.stylePrompt);
  if (violations.length > 0 || !constraints.stylePrompt.trim()) {
    constraints.warnings.push(...violations);
    constraints.stylePrompt = buildStylePromptFromConstraints(constraints, input.caption);
  }
  return constraints;
}

export function hasExplicitGenerationIntent(constraints: PromptConstraints): boolean {
  const explicit = constraints.explicit;
  return Boolean(
    explicit.genres.length > 0 ||
    explicit.language ||
    explicit.vocalGender ||
    explicit.vocalTone.length > 0 ||
    explicit.mood.length > 0 ||
    explicit.bpm ||
    explicit.duration ||
    explicit.keyScale ||
    explicit.timeSignature ||
    explicit.instrumentation.length > 0 ||
    explicit.avoid.length > 0 ||
    explicit.instrumental ||
    explicit.mustBeVocal
  );
}

export function buildLockedConstraints(constraints: PromptConstraints, profile?: StyleProfile): LockedGenerationConstraints {
  return {
    styleProfile: profile?.id,
    genres: constraints.explicit.genres,
    language: constraints.explicit.language,
    vocalGender: constraints.explicit.vocalGender,
    vocalTone: constraints.explicit.vocalTone,
    mood: constraints.explicit.mood,
    bpm: constraints.explicit.bpm || constraints.inferred.bpm,
    bpmRange: profile?.bpmRange,
    duration: constraints.explicit.duration,
    keyScale: constraints.explicit.keyScale || constraints.inferred.keyScale,
    timeSignature: constraints.explicit.timeSignature || constraints.inferred.timeSignature,
    instrumental: constraints.explicit.instrumental,
    instrumentation: constraints.explicit.instrumentation,
    avoid: constraints.explicit.avoid,
  };
}

export function preserveExplicitFormatIntent(input: PromptFormatInput, result: PromptFormatResult): PromptFormatResult {
  const constraints = extractPromptConstraintsFallback(input);
  let caption = result.caption || input.caption;
  const violations = validateStylePromptAgainstConstraints(constraints, caption);
  const captionLanguage = inferCaptionOutputLanguage(input);
  const looksEnglish = captionLanguage !== 'en' && /\b(song|track|with|features|female|male|vocals|lead vocal|clear presence|mix|mood|emotion|tempo|target duration|do not add|unrelated genres)\b/i.test(caption);

  if (violations.length > 0 || looksEnglish) {
    caption = buildStylePromptFromConstraints(constraints, input.caption);
  }

  return {
    ...result,
    caption,
    bpm: constraints.explicit.bpm ?? result.bpm,
    duration: constraints.explicit.duration ?? result.duration,
    key_scale: constraints.explicit.keyScale ?? result.key_scale,
    time_signature: constraints.explicit.timeSignature ?? result.time_signature,
    vocal_language: constraints.explicit.language ?? result.vocal_language,
  };
}

export function validatePromptCompilerGoldenCases(): string[] {
  const errors: string[] = [];
  for (const testCase of GOLDEN_PROMPT_CASES) {
    const constraints = extractPromptConstraintsFallback({ caption: testCase.input });
    const expected = testCase.expected;
    for (const genre of expected.genres || []) {
      if (!constraints.explicit.genres.some(value => normalizeText(value).includes(normalizeText(genre)))) {
        errors.push(`${testCase.name}: missing genre ${genre}`);
      }
    }
    if ('language' in expected && constraints.explicit.language !== expected.language) {
      errors.push(`${testCase.name}: expected language ${expected.language}, got ${constraints.explicit.language || 'none'}`);
    }
    if ('vocalGender' in expected && constraints.explicit.vocalGender !== expected.vocalGender) {
      errors.push(`${testCase.name}: expected vocalGender ${expected.vocalGender}, got ${constraints.explicit.vocalGender || 'none'}`);
    }
    for (const tone of expected.vocalTone || []) {
      if (!constraints.explicit.vocalTone.some(value => normalizeText(value).includes(normalizeText(tone)))) {
        errors.push(`${testCase.name}: missing vocal tone ${tone}`);
      }
    }
    for (const mood of expected.mood || []) {
      if (!constraints.explicit.mood.some(value => normalizeText(value).includes(normalizeText(mood)))) {
        errors.push(`${testCase.name}: missing mood ${mood}`);
      }
    }
    if ('bpm' in expected && constraints.explicit.bpm !== expected.bpm) {
      errors.push(`${testCase.name}: expected bpm ${expected.bpm}, got ${constraints.explicit.bpm || 'none'}`);
    }
  }
  return errors;
}
