import React from 'react';
import { Award, Star } from 'lucide-react';
import { UserBadge } from '../services/api';
import { useI18n } from '../context/I18nContext';

interface ProfileProgressCardProps {
  level?: number;
  xp?: number;
  badges?: UserBadge[];
}

export const ProfileProgressCard: React.FC<ProfileProgressCardProps> = ({
  level = 1,
  xp = 0,
  badges = [],
}) => {
  const { t } = useI18n();
  const currentLevel = Math.max(1, level || 1);
  const xpIntoLevel = Math.max(0, xp % 100);
  const xpToNext = xpIntoLevel === 0 && xp > 0 ? 100 : 100 - xpIntoLevel;

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-black/20 p-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-300 flex items-center justify-center">
            <Star size={17} />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-900 dark:text-white">
              {t('level')} {currentLevel}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {xp} {t('xp')} · {t('nextLevelIn').replace('{count}', String(xpToNext))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          <Award size={15} className="text-yellow-500" />
          {t('badgesUnlocked').replace('{count}', String(badges.length))}
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-pink-500 to-orange-500"
          style={{ width: `${xpIntoLevel}%` }}
        />
      </div>
    </div>
  );
};
