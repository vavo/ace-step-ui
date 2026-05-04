import React from 'react';
import { Sparkles, Trophy, X } from 'lucide-react';
import { UserBadge } from '../services/api';
import { useI18n } from '../context/I18nContext';

interface BadgeAwardModalProps {
  badge: UserBadge | null;
  onClose: () => void;
}

const colorClasses: Record<string, string> = {
  green: 'from-emerald-400 to-lime-300 text-emerald-950 shadow-emerald-500/30',
  pink: 'from-pink-400 to-rose-300 text-pink-950 shadow-pink-500/30',
  yellow: 'from-yellow-300 to-amber-400 text-yellow-950 shadow-yellow-500/30',
  blue: 'from-sky-300 to-blue-400 text-blue-950 shadow-blue-500/30',
};

export const BadgeAwardModal: React.FC<BadgeAwardModalProps> = ({ badge, onClose }) => {
  const { t } = useI18n();

  if (!badge) return null;

  const badgeColor = colorClasses[badge.color] || colorClasses.blue;
  const badgeKey = badge.badge_key || badge.id;
  const translatedLabel = t(`badge_${badgeKey}_label`);
  const translatedDescription = t(`badge_${badgeKey}_description`);
  const badgeLabel = translatedLabel.startsWith('badge_') ? badge.label : translatedLabel;
  const badgeDescription = translatedDescription.startsWith('badge_') ? badge.description : translatedDescription;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-6 text-center shadow-2xl shadow-black/50 animate-in zoom-in-95 fade-in duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-16 h-44 w-44 rounded-full bg-yellow-400/20 blur-3xl" />

        <div className="relative">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-yellow-300">
            <Sparkles size={26} />
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.28em] text-pink-300">
            {t('badgeModalCongratulations')}
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            {t('badgeModalTitle')}
          </h2>

          <div className={`mx-auto my-6 flex min-h-32 w-32 flex-col items-center justify-center rounded-full bg-gradient-to-br ${badgeColor} p-4 shadow-2xl`}>
            <Trophy size={34} className="mb-2" />
            <span className="text-center text-sm font-black leading-tight">
              {badgeLabel}
            </span>
          </div>

          <p className="mx-auto max-w-xs text-sm leading-relaxed text-zinc-300">
            {badgeDescription}
          </p>

          <button
            onClick={onClose}
            className="mt-6 w-full rounded-full bg-white px-5 py-3 text-sm font-black text-zinc-950 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {t('badgeModalClose')}
          </button>
        </div>
      </div>
    </div>
  );
};
