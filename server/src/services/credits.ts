import { db, generateUUID, transaction } from '../db/sqlite.js';

export const CREDIT_AMOUNTS = {
  signupGrant: 100,
  dailyClaim: 20,
  freeBalanceCap: 120,
  streakBonusStep: 5,
  streakBonusMax: 25,
  lyricDraft: 2,
  generationVariation: 20,
} as const;

export type CreditReason =
  | 'signup_grant'
  | 'daily_claim'
  | 'lyrics_draft'
  | 'generation_reserve'
  | 'generation_refund'
  | 'admin_adjustment';

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly balance: number,
    public readonly required: number
  ) {
    super('Insufficient credits');
    this.name = 'InsufficientCreditsError';
  }
}

type UserCreditRow = {
  id: string;
  credit_balance: number | null;
  last_daily_credit_claim_at: string | null;
  credit_streak_days: number | null;
};

export type CreditSummary = {
  balance: number;
  lastDailyClaimAt: string | null;
  streakDays: number;
};

export function calculateGenerationCreditCost(variationCount: number | undefined): number {
  const safeVariations = Math.max(1, Math.min(4, Number.isFinite(variationCount) ? Math.floor(Number(variationCount)) : 1));
  return safeVariations * CREDIT_AMOUNTS.generationVariation;
}

export function getCreditSummary(userId: string): CreditSummary {
  const row = db.prepare(
    `SELECT id, credit_balance, last_daily_credit_claim_at, credit_streak_days
     FROM users
     WHERE id = ?`
  ).get(userId) as UserCreditRow | undefined;

  if (!row) {
    throw new Error('User not found');
  }

  return {
    balance: row.credit_balance ?? 0,
    lastDailyClaimAt: row.last_daily_credit_claim_at,
    streakDays: row.credit_streak_days ?? 0,
  };
}

export function recordCreditLedgerEntry(params: {
  userId: string;
  delta: number;
  balanceAfter: number;
  reason: CreditReason;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}): void {
  db.prepare(
    `INSERT INTO credit_ledger
       (id, user_id, delta, balance_after, reason, reference_type, reference_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    generateUUID(),
    params.userId,
    params.delta,
    params.balanceAfter,
    params.reason,
    params.referenceType ?? null,
    params.referenceId ?? null,
    params.metadata ? JSON.stringify(params.metadata) : null
  );
}

export function reserveCredits(params: {
  userId: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  reason?: CreditReason;
  metadata?: Record<string, unknown>;
}): CreditSummary {
  return transaction(() => {
    const summary = getCreditSummary(params.userId);
    if (summary.balance < params.amount) {
      throw new InsufficientCreditsError(summary.balance, params.amount);
    }

    const nextBalance = summary.balance - params.amount;
    db.prepare('UPDATE users SET credit_balance = ?, updated_at = datetime(\'now\') WHERE id = ?').run(nextBalance, params.userId);
    recordCreditLedgerEntry({
      userId: params.userId,
      delta: -params.amount,
      balanceAfter: nextBalance,
      reason: params.reason ?? 'generation_reserve',
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      metadata: params.metadata,
    });

    return { ...summary, balance: nextBalance };
  });
}

export function refundCredits(params: {
  userId: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  reason?: CreditReason;
  metadata?: Record<string, unknown>;
}): CreditSummary {
  return transaction(() => {
    const summary = getCreditSummary(params.userId);
    const nextBalance = summary.balance + params.amount;
    db.prepare('UPDATE users SET credit_balance = ?, updated_at = datetime(\'now\') WHERE id = ?').run(nextBalance, params.userId);
    recordCreditLedgerEntry({
      userId: params.userId,
      delta: params.amount,
      balanceAfter: nextBalance,
      reason: params.reason ?? 'generation_refund',
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      metadata: params.metadata,
    });

    return { ...summary, balance: nextBalance };
  });
}
