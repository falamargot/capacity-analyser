import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onClick: () => void;
  compact?: boolean;
}

const FullscreenButton: React.FC<FullscreenButtonProps> = ({ isFullscreen, onClick, compact = false }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      aria-pressed={isFullscreen}
      className={`group relative inline-flex items-center gap-2 border text-left transition-all duration-200 ${
        compact ? 'h-10 w-10 justify-center rounded-xl p-0' : 'min-h-[44px] rounded-[18px] px-3 py-2'
      } ${
        isFullscreen
          ? 'border-emerald-200/90 bg-emerald-50/95 text-emerald-700 shadow-[0_14px_28px_-22px_rgba(5,150,105,0.72)] dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-200'
          : 'border-white/70 bg-white/78 text-slate-700 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.65)] hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/72 dark:text-slate-200 dark:hover:bg-slate-900'
      }`}
      title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-slate-400/30" />
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100/85 text-current dark:bg-slate-800/85">
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold leading-4">
            {isFullscreen ? 'Windowed' : 'Expand'}
          </span>
        </span>
      )}
    </button>
  );
};

export default FullscreenButton;
