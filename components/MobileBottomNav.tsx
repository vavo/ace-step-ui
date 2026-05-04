import React from 'react';
import { Disc, Library, Lightbulb, LogIn, Radio, Trophy } from 'lucide-react';
import { View } from '../types';
import { useI18n } from '../context/I18nContext';

interface MobileBottomNavProps {
  currentView: View;
  user?: { username: string; avatar_url?: string } | null;
  onNavigate: (view: View) => void;
  onProfile: () => void;
  onLogin: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  user,
  onNavigate,
  onProfile,
  onLogin,
}) => {
  const { t } = useI18n();

  return (
    <nav className="md:hidden h-[70px] shrink-0 bg-white/95 dark:bg-black/95 border-t border-zinc-200 dark:border-white/10 backdrop-blur safe-area-inset-bottom z-50">
      <div className="grid grid-cols-6 h-full">
        <NavButton
          icon={<Disc size={20} />}
          label={t('mobileNavCreate')}
          active={currentView === 'create'}
          onClick={() => onNavigate('create')}
        />
        <NavButton
          icon={<Radio size={20} />}
          label={t('mobileNavFeed')}
          active={currentView === 'feed'}
          onClick={() => onNavigate('feed')}
        />
        <NavButton
          icon={<Lightbulb size={20} />}
          label={t('mobileNavIdeas')}
          active={currentView === 'ideas'}
          onClick={() => onNavigate('ideas')}
        />
        <NavButton
          icon={<Trophy size={20} />}
          label={t('mobileNavLeaderboard')}
          active={currentView === 'leaderboard'}
          onClick={() => onNavigate('leaderboard')}
        />
        <NavButton
          icon={<Library size={20} />}
          label={t('mobileNavLibrary')}
          active={currentView === 'library'}
          onClick={() => onNavigate('library')}
        />
        <NavButton
          icon={user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.username} loading="lazy" decoding="async" className="w-5 h-5 rounded-full object-cover" />
          ) : user ? (
            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
              {user.username[0]?.toUpperCase()}
            </span>
          ) : (
            <LogIn size={20} />
          )}
          label={user ? t('mobileNavProfile') : t('mobileNavSignIn')}
          active={currentView === 'profile'}
          onClick={user ? onProfile : onLogin}
        />
      </div>
    </nav>
  );
};

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-w-0 flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors ${
      active
        ? 'text-pink-600 dark:text-pink-400'
        : 'text-zinc-500 dark:text-zinc-400 active:text-zinc-900 dark:active:text-white'
    }`}
    aria-current={active ? 'page' : undefined}
    title={label}
  >
    <span className={`h-6 flex items-center justify-center ${active ? 'scale-105' : ''}`}>
      {icon}
    </span>
    <span className="w-full truncate leading-none">{label}</span>
  </button>
);
