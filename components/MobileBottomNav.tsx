import React, { useState } from 'react';
import { Disc, GraduationCap, Library, Lightbulb, LogIn, Menu, Radio, Search, Trophy, X } from 'lucide-react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navigateAndClose = (view: View) => {
    onNavigate(view);
    setIsMenuOpen(false);
  };

  const profileAndClose = () => {
    if (user) {
      onProfile();
    } else {
      onLogin();
    }
    setIsMenuOpen(false);
  };

  const menuItems: Array<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    active?: boolean;
  }> = [
    {
      label: t('create'),
      icon: <Disc size={20} />,
      onClick: () => navigateAndClose('create'),
      active: currentView === 'create',
    },
    {
      label: t('library'),
      icon: <Library size={20} />,
      onClick: () => navigateAndClose('library'),
      active: currentView === 'library',
    },
    {
      label: t('feed'),
      icon: <Radio size={20} />,
      onClick: () => navigateAndClose('feed'),
      active: currentView === 'feed',
    },
    {
      label: t('ideas'),
      icon: <Lightbulb size={20} />,
      onClick: () => navigateAndClose('ideas'),
      active: currentView === 'ideas',
    },
    {
      label: t('search'),
      icon: <Search size={20} />,
      onClick: () => navigateAndClose('search'),
      active: currentView === 'search',
    },
    {
      label: t('leaderboards'),
      icon: <Trophy size={20} />,
      onClick: () => navigateAndClose('leaderboard'),
      active: currentView === 'leaderboard',
    },
    {
      label: t('training'),
      icon: <GraduationCap size={20} />,
      onClick: () => navigateAndClose('training'),
      active: currentView === 'training',
    },
    {
      label: user ? t('mobileNavProfile') : t('mobileNavSignIn'),
      icon: user?.avatar_url ? (
        <img src={user.avatar_url} alt={user.username} loading="lazy" decoding="async" className="w-5 h-5 rounded-full object-cover" />
      ) : user ? (
        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
          {user.username[0]?.toUpperCase()}
        </span>
      ) : (
        <LogIn size={20} />
      ),
      onClick: profileAndClose,
      active: currentView === 'profile',
    },
  ];

  const isMoreActive = ['ideas', 'leaderboard', 'training', 'profile', 'song', 'playlist'].includes(currentView);

  return (
    <>
      {isMenuOpen && (
        <div className="fixed inset-0 z-[90] md:hidden">
          <button
            type="button"
            aria-label={t('cancel')}
            className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-zinc-200 bg-white p-4 pb-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-pink-500">{t('moreOptions')}</div>
                <h2 className="text-xl font-black text-zinc-950 dark:text-white">getMUSIC!</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label={t('cancel')}
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {menuItems.map((item) => (
                <MenuSheetButton
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  active={Boolean(item.active)}
                  onClick={item.onClick}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden h-[70px] shrink-0 bg-white/95 dark:bg-black/95 border-t border-zinc-200 dark:border-white/10 backdrop-blur safe-area-inset-bottom z-50">
        <div className="grid grid-cols-5 h-full">
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
            icon={<Library size={20} />}
            label={t('mobileNavLibrary')}
            active={currentView === 'library'}
            onClick={() => onNavigate('library')}
          />
          <NavButton
            icon={<Search size={20} />}
            label={t('search')}
            active={currentView === 'search'}
            onClick={() => onNavigate('search')}
          />
          <NavButton
            icon={<Menu size={20} />}
            label={t('more')}
            active={isMoreActive || isMenuOpen}
            onClick={() => setIsMenuOpen(true)}
          />
        </div>
      </nav>
    </>
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

const MenuSheetButton: React.FC<NavButtonProps> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
      active
        ? 'border-pink-500/40 bg-pink-500/10 text-pink-600 dark:text-pink-300'
        : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:bg-white/10'
    }`}
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-current shadow-sm dark:bg-black/30">
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate text-sm font-bold">{label}</span>
  </button>
);
