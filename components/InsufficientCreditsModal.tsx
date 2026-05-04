import React, { useEffect } from 'react';
import { Coins, X } from 'lucide-react';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe?: () => void;
}

export const InsufficientCreditsModal: React.FC<InsufficientCreditsModalProps> = ({
  isOpen,
  onClose,
  onSubscribe,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-6 text-center shadow-2xl shadow-black/50 animate-in zoom-in-95 fade-in duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-yellow-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-16 h-44 w-44 rounded-full bg-pink-500/15 blur-3xl" />

        <div className="relative">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400/15 text-yellow-300 ring-1 ring-yellow-400/30">
            <Coins size={28} />
          </div>

          <h2 className="text-xl font-black text-white">
            Not enough credits
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            You dont have enough credits to generate a next song. Either return tomorrow to get some for free or subscribe.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={onClose}
              className="flex-1 rounded-full bg-zinc-800 px-5 py-3 text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              Return tomorrow
            </button>
            <button
              onClick={onSubscribe || onClose}
              className="flex-1 rounded-full bg-white px-5 py-3 text-sm font-black text-zinc-950 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Subscribe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
