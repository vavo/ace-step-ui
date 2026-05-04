import { Router, Response } from 'express';
import { config } from '../config/index.js';
import { generateUUID } from '../db/sqlite.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import {
  CREDIT_AMOUNTS,
  getCreditSummary,
  InsufficientCreditsError,
  refundCredits,
  reserveCredits,
} from '../services/credits.js';

const router = Router();

type LyricsDraftBody = {
  prompt?: string;
  mood?: string;
  style?: string;
  language?: string;
};

type LyricsDraft = {
  title: string;
  lyrics: string;
  stylePrompt: string;
  language: string;
};

const LANGUAGE_ALIASES: Array<{ code: string; aliases: string[] }> = [
  { code: 'sk', aliases: ['sk', 'slovak', 'slovensky', 'slovencina', 'slovencine', 'po slovensky', 'v slovencine'] },
  { code: 'cs', aliases: ['cs', 'cz', 'czech', 'cesky', 'cestina', 'cestine', 'po cesky', 'v cestine'] },
  { code: 'en', aliases: ['en', 'english', 'anglicky', 'anglictina', 'anglictine', 'po anglicky', 'in english'] },
  { code: 'de', aliases: ['de', 'german', 'deutsch', 'nemecky', 'nemcina', 'nemcine', 'po nemecky'] },
  { code: 'fr', aliases: ['fr', 'french', 'francais', 'francuzsky', 'francuzstina', 'francuzstine'] },
  { code: 'es', aliases: ['es', 'spanish', 'espanol', 'spanielsky', 'spanielcina', 'spanielcine'] },
  { code: 'it', aliases: ['it', 'italian', 'taliansky', 'taliancina', 'taliancine'] },
  { code: 'pl', aliases: ['pl', 'polish', 'polsky', 'polstina', 'polstine'] },
  { code: 'hu', aliases: ['hu', 'hungarian', 'madarsky', 'madarcina', 'madarcine'] },
  { code: 'uk', aliases: ['uk', 'ukrainian', 'ukrajinsky', 'ukrajincina', 'ukrajincine'] },
  { code: 'ro', aliases: ['ro', 'romanian', 'rumunsky', 'rumuncina', 'rumuncine'] },
  { code: 'nl', aliases: ['nl', 'dutch', 'nederlands', 'holandsky', 'holandcina', 'holandcine'] },
  { code: 'pt', aliases: ['pt', 'portuguese', 'portugalsky', 'portugalcina', 'portugalcine'] },
  { code: 'sv', aliases: ['sv', 'swedish', 'svedsky', 'svedcina', 'svedcine'] },
  { code: 'no', aliases: ['no', 'norwegian', 'norsky', 'norcina', 'norcine'] },
  { code: 'da', aliases: ['da', 'danish', 'dansky', 'dancina', 'dancine'] },
  { code: 'fi', aliases: ['fi', 'finnish', 'finsky', 'fincina', 'fincine'] },
  { code: 'el', aliases: ['el', 'greek', 'grecky', 'grecina', 'grecine'] },
  { code: 'tr', aliases: ['tr', 'turkish', 'turecky', 'turectina', 'turectine'] },
  { code: 'hr', aliases: ['hr', 'croatian', 'chorvatsky', 'chorvatcina', 'chorvatcine'] },
  { code: 'sr', aliases: ['sr', 'serbian', 'srbsky', 'srbcina', 'srbcine'] },
  { code: 'sl', aliases: ['sl', 'slovenian', 'slovinsky', 'slovincina', 'slovincine'] },
  { code: 'bg', aliases: ['bg', 'bulgarian', 'bulharsky', 'bulharcina', 'bulharcine'] },
  { code: 'ru', aliases: ['ru', 'russian', 'rusky', 'rustina', 'rustine'] },
];

function usesReasoningControls(model: string): boolean {
  return /\b(gpt-5|o[1-9]|o\d)/i.test(model);
}

function normalizeLanguageText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasLanguageAlias(haystack: string, alias: string): boolean {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escapedAlias}([^a-z0-9]|$)`).test(haystack);
}

function normalizeLanguageCode(value: string): string | null {
  const normalized = normalizeLanguageText(value);
  if (!normalized || normalized === 'auto' || normalized === 'unknown') return null;

  const codeMatch = normalized.match(/^[a-z]{2,3}(?:-[a-z]{2})?$/);
  if (codeMatch) return normalized.slice(0, 2);

  for (const language of LANGUAGE_ALIASES) {
    if (language.aliases.some(alias => hasLanguageAlias(normalized, alias))) {
      return language.code;
    }
  }

  return null;
}

function resolveLyricsLanguageCode(input: Required<LyricsDraftBody>): string {
  const requestText = normalizeLanguageText([input.prompt, input.mood, input.style].filter(Boolean).join(' '));

  for (const language of LANGUAGE_ALIASES) {
    if (language.aliases.some(alias => hasLanguageAlias(requestText, alias))) {
      return language.code;
    }
  }

  return normalizeLanguageCode(input.language) || 'sk';
}

function toDraftString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(toDraftString).filter(Boolean).join('\n').trim();
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(toDraftString).filter(Boolean).join('\n').trim();
  }
  return '';
}

function parseDraftJson(text: string, fallback: Required<LyricsDraftBody>): LyricsDraft | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) {
    const lyrics = text.trim();
    if (lyrics.length < 20) return null;
    return {
      title: fallback.prompt.slice(0, 60) || 'Nový text',
      lyrics,
      stylePrompt: fallback.style || fallback.prompt,
      language: fallback.language || 'sk',
    };
  }

  try {
    const parsed = JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
    const title = toDraftString(parsed.title || parsed.name || parsed.songTitle) || fallback.prompt.slice(0, 60) || 'Nový text';
    const lyrics = toDraftString(parsed.lyrics || parsed.lyric || parsed.text || parsed.draft);
    const stylePrompt = toDraftString(parsed.stylePrompt || parsed.style_prompt || parsed.style || parsed.caption) || fallback.style || fallback.prompt;
    if (!lyrics || !stylePrompt) return null;
    return {
      title,
      lyrics,
      stylePrompt,
      language: toDraftString(parsed.language || parsed.vocal_language) || fallback.language || 'sk',
    };
  } catch {
    return null;
  }
}

async function draftLyricsWithOpenAI(input: Required<LyricsDraftBody>): Promise<LyricsDraft> {
  if (!config.openai.apiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  const languageCode = resolveLyricsLanguageCode(input);
  const fallbackInput = { ...input, language: languageCode };
  const systemPrompt = `You write catchy song drafts. Return ONLY JSON with exactly these keys: title, lyrics, stylePrompt, language. Language must be "${languageCode}" unless the user's request explicitly asks for another language. Lyrics must include at least two section labels, such as [Verse] and [Chorus], written in the language of the generated lyrics. Keep the lyrics original, memorable, singable, emotionally direct, and suitable for 18+ audiences unless specified by the user. Make stylePrompt concise, vivid, and production-oriented so it clearly guides the music model's genre, mood, tempo, instrumentation, and vocal style. Do not mention that you are an AI.`;
  const userPrompt = [
    `User request: ${input.prompt}`,
    `Mood: ${input.mood || 'auto'}`,
    `Style: ${input.style || 'auto'}`,
  ].join('\n');

  const model = config.openai.model;
  const payload: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  };

  const useReasoningControls = usesReasoningControls(model);
  if (useReasoningControls) {
    payload.reasoning_effort = config.openai.reasoningEffort;
    payload.max_completion_tokens = 2000;
  } else {
    payload.temperature = 0.9;
    payload.top_p = 0.95;
    payload.max_tokens = 900;
  }

  let response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  let responseText = await response.text();
  if (
    !response.ok
    && response.status === 400
    && !useReasoningControls
    && /max_tokens.*max_completion_tokens|unsupported parameter/i.test(responseText)
  ) {
    delete payload.max_tokens;
    delete payload.temperature;
    delete payload.top_p;
    payload.reasoning_effort = config.openai.reasoningEffort;
    payload.max_completion_tokens = 2000;

    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    responseText = await response.text();
  }

  if (!response.ok) {
    console.error('[Lyrics] OpenAI API failed:', response.status, responseText.slice(0, 500));
    throw new Error('Lyrics generation failed');
  }

  const responseJson = JSON.parse(responseText) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const rawText = responseJson.choices?.[0]?.message?.content ?? '';
  const draft = parseDraftJson(rawText, fallbackInput);
  if (!draft) {
    console.error('[Lyrics] Invalid draft response:', {
      finishReason: responseJson.choices?.[0]?.finish_reason,
      preview: rawText.slice(0, 500),
    });
    throw new Error('Lyrics generation returned an invalid draft');
  }
  return draft;
}

router.post('/draft', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as LyricsDraftBody;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const draftId = generateUUID();
  let reserved = false;

  try {
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    if (!config.openai.apiKey) {
      res.status(503).json({ error: 'OpenAI API key is not configured' });
      return;
    }

    const summary = getCreditSummary(req.user!.id);
    if (!summary.unlimited && summary.balance < CREDIT_AMOUNTS.lyricDraft) {
      res.status(402).json({
        error: 'Insufficient credits',
        creditBalance: summary.balance,
        creditsRequired: CREDIT_AMOUNTS.lyricDraft,
      });
      return;
    }

    reserveCredits({
      userId: req.user!.id,
      amount: CREDIT_AMOUNTS.lyricDraft,
      reason: 'lyrics_draft',
      referenceType: 'lyrics_draft',
      referenceId: draftId,
      metadata: { prompt },
    });
    reserved = true;

    const draft = await draftLyricsWithOpenAI({
      prompt,
      mood: typeof body.mood === 'string' ? body.mood.trim() : '',
      style: typeof body.style === 'string' ? body.style.trim() : '',
      language: typeof body.language === 'string' && body.language.trim() ? body.language.trim() : 'sk',
    });

    res.json({
      draftId,
      draft,
      creditsSpent: CREDIT_AMOUNTS.lyricDraft,
    });
  } catch (error) {
    if (reserved) {
      refundCredits({
        userId: req.user!.id,
        amount: CREDIT_AMOUNTS.lyricDraft,
        referenceType: 'lyrics_draft',
        referenceId: draftId,
        metadata: { reason: 'lyrics_draft_failed' },
      });
    }

    if (error instanceof InsufficientCreditsError) {
      res.status(402).json({
        error: error.message,
        creditBalance: error.balance,
        creditsRequired: error.required,
      });
      return;
    }

    console.error('Draft lyrics error:', error);
    res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to draft lyrics' });
  }
});

export default router;
