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

function usesReasoningControls(model: string): boolean {
  return /\b(gpt-5|o[1-9]|o\d)/i.test(model);
}

function parseDraftJson(text: string): LyricsDraft | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) return null;

  try {
    const parsed = JSON.parse(text.slice(first, last + 1)) as Partial<LyricsDraft>;
    if (!parsed.title || !parsed.lyrics || !parsed.stylePrompt) return null;
    return {
      title: String(parsed.title).trim(),
      lyrics: String(parsed.lyrics).trim(),
      stylePrompt: String(parsed.stylePrompt).trim(),
      language: String(parsed.language || 'sk').trim() || 'sk',
    };
  } catch {
    return null;
  }
}

async function draftLyricsWithOpenAI(input: Required<LyricsDraftBody>): Promise<LyricsDraft> {
  if (!config.openai.apiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  const prompt = `
You write catchy song drafts.
Return ONLY JSON with keys: title, lyrics, stylePrompt, language.
Language must be "${input.language}" unless the user prompt clearly asks for another language.
Lyrics must include section labels like [Verse] and [Chorus] in the language of generated lyrics.
Keep the lyrics original, memorable, singable, emotionally direct, and suitable for 18+ audiences unless specified by the user.
Do not mention that you are an AI.

User prompt: ${input.prompt}
Mood: ${input.mood || 'auto'}
Style: ${input.style || 'modern pop / hiphop / rock / electronic depending on prompt'}
`.trim();

  const model = config.openai.model;
  const payload: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  };

  const useReasoningControls = usesReasoningControls(model);
  if (useReasoningControls) {
    payload.reasoning_effort = config.openai.reasoningEffort;
    payload.max_completion_tokens = 900;
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
    payload.max_completion_tokens = 900;

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
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText = responseJson.choices?.[0]?.message?.content ?? '';
  const draft = parseDraftJson(rawText);
  if (!draft) {
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
