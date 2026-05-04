import React from 'react';
import { Coins, Gift, Loader2, Flame } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

interface CreditStreakReminderProps {
  balance: number;
  unlimited?: boolean;
  cost: number;
  hasEnoughCredits: boolean;
  isLoading: boolean;
  isClaiming: boolean;
  lastDailyClaimAt?: string | null;
  streakDays?: number;
  message?: string | null;
  onClaimDaily: () => void;
}

function claimedToday(lastDailyClaimAt?: string | null): boolean {
  if (!lastDailyClaimAt) return false;
  const claimed = new Date(lastDailyClaimAt);
  if (Number.isNaN(claimed.getTime())) return false;
  const today = new Date();
  return claimed.toDateString() === today.toDateString();
}

export const CreditStreakReminder: React.FC<CreditStreakReminderProps> = ({
  balance,
  unlimited = false,
  cost,
  hasEnoughCredits,
  isLoading,
  isClaiming,
  lastDailyClaimAt,
  streakDays = 0,
  message,
  onClaimDaily,
}) => {
  const { t } = useI18n();
  const alreadyClaimed = unlimited || claimedToday(lastDailyClaimAt);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-suno-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-yellow-400/15 text-yellow-600 dark:text-yellow-300 flex items-center justify-center">
            <Coins size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-zinc-900 dark:text-white">
              {isLoading ? t('loading') : unlimited ? t('unlimitedCredits') : `${balance} ${t('creditsShort')}`}
            </div>
            <div className={`text-[11px] ${hasEnoughCredits ? 'text-zinc-500 dark:text-zinc-400' : 'text-rose-500 dark:text-rose-300'}`}>
              {unlimited
                ? t('unlimitedCredits')
                : hasEnoughCredits
                ? `${cost} ${t('creditsShort')} / ${t('createButton')}`
                : t('needCredits').replace('{count}', String(Math.max(0, cost - balance)))}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClaimDaily}
          disabled={unlimited || isClaiming || isLoading || alreadyClaimed}
          className="h-9 px-3 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
        >
          {isClaiming ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
          {unlimited ? t('unlimitedCredits') : alreadyClaimed ? t('claimedToday') : t('claimDaily')}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5 min-w-0">
          <Flame size={13} className="text-orange-500" />
          {streakDays > 0 ? `${streakDays} ${t('dayStreak')}` : t('claimDailyHint')}
        </span>
        {message && <span className="text-right font-semibold text-zinc-700 dark:text-zinc-200">{message}</span>}
      </div>
    </div>
  );
};
