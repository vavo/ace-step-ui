import { db, generateUUID, transaction } from '../db/sqlite.js';
import { awardBadge } from './gamification.js';

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

export type CreditLedgerEntry = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: CreditReason;
  referenceType: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type DailyClaimResult = CreditSummary & {
  claimed: boolean;
  grantAmount: number;
  reason?: 'already_claimed' | 'balance_cap_reached';
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

export function getCreditLedger(userId: string, limit = 50): CreditLedgerEntry[] {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = db.prepare(
    `SELECT id, delta, balance_after, reason, reference_type, reference_id, metadata, created_at
     FROM credit_ledger
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`
  ).all(userId, safeLimit) as Array<{
    id: string;
    delta: number;
    balance_after: number;
    reason: CreditReason;
    reference_type: string | null;
    reference_id: string | null;
    metadata: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    delta: row.delta,
    balanceAfter: row.balance_after,
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : null,
    createdAt: row.created_at,
  }));
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

export function recordSignupGrantIfMissing(userId: string): void {
  const existing = db.prepare(
    `SELECT 1
     FROM credit_ledger
     WHERE user_id = ? AND reason = 'signup_grant'
     LIMIT 1`
  ).get(userId);

  if (existing) return;

  const summary = getCreditSummary(userId);
  if (summary.balance <= 0) return;

  recordCreditLedgerEntry({
    userId,
    delta: CREDIT_AMOUNTS.signupGrant,
    balanceAfter: summary.balance,
    reason: 'signup_grant',
    metadata: { source: 'account_created' },
  });
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

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(first: string, second: string): number {
  const firstDate = new Date(`${first}T00:00:00.000Z`);
  const secondDate = new Date(`${second}T00:00:00.000Z`);
  return Math.round((secondDate.getTime() - firstDate.getTime()) / 86_400_000);
}

export function claimDailyCredits(userId: string, now = new Date()): DailyClaimResult {
  return transaction(() => {
    const summary = getCreditSummary(userId);
    const today = dateKey(now);
    const lastClaimDate = summary.lastDailyClaimAt ? dateKey(new Date(summary.lastDailyClaimAt)) : null;

    if (lastClaimDate === today) {
      return { ...summary, claimed: false, grantAmount: 0, reason: 'already_claimed' };
    }

    if (summary.balance >= CREDIT_AMOUNTS.freeBalanceCap) {
      return { ...summary, claimed: false, grantAmount: 0, reason: 'balance_cap_reached' };
    }

    const nextStreakDays = lastClaimDate && daysBetween(lastClaimDate, today) === 1
      ? summary.streakDays + 1
      : 1;
    const streakBonus = Math.min((nextStreakDays - 1) * CREDIT_AMOUNTS.streakBonusStep, CREDIT_AMOUNTS.streakBonusMax);
    const uncappedGrant = CREDIT_AMOUNTS.dailyClaim + streakBonus;
    const grantAmount = Math.min(uncappedGrant, CREDIT_AMOUNTS.freeBalanceCap - summary.balance);
    const nextBalance = summary.balance + grantAmount;
    const claimedAt = now.toISOString();

    db.prepare(
      `UPDATE users
       SET credit_balance = ?, last_daily_credit_claim_at = ?, credit_streak_days = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(nextBalance, claimedAt, nextStreakDays, userId);

    recordCreditLedgerEntry({
      userId,
      delta: grantAmount,
      balanceAfter: nextBalance,
      reason: 'daily_claim',
      metadata: { streakDays: nextStreakDays, streakBonus },
    });

    if (nextStreakDays >= 7) {
      awardBadge(userId, 'seven_day_streak', { streakDays: nextStreakDays });
    }

    return {
      balance: nextBalance,
      lastDailyClaimAt: claimedAt,
      streakDays: nextStreakDays,
      claimed: true,
      grantAmount,
    };
  });
}
