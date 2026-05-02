import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}) => (
  <div className="border border-dashed border-zinc-300 dark:border-white/10 rounded-lg p-6 md:p-8 text-center text-zinc-500 dark:text-zinc-400">
    {icon && (
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-300 flex items-center justify-center">
        {icon}
      </div>
    )}
    <h2 className="text-base font-bold text-zinc-900 dark:text-white">{title}</h2>
    {body && <p className="mt-2 text-sm max-w-sm mx-auto">{body}</p>}
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 h-10 px-4 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
      >
        {actionLabel}
      </button>
    )}
  </div>
);
