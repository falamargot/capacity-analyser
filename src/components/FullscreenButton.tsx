import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onClick: () => void;
  compact?: boolean;
}

const CONTROL_BUTTON_SURFACE_CLASS_NAME = 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,249,0.92))] text-slate-700 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.35)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(30,41,59,0.84))] dark:text-slate-200 dark:shadow-[0_12px_28px_-24px_rgba(15,23,42,0.72)] dark:hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.9))]';

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
          ? `${CONTROL_BUTTON_SURFACE_CLASS_NAME} ring-1 ring-emerald-300/60 text-emerald-700 dark:ring-emerald-400/20 dark:text-emerald-200`
          : CONTROL_BUTTON_SURFACE_CLASS_NAME
      }`}
      title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent dark:via-slate-400/30" />
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isFullscreen
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
            : 'bg-slate-100 text-current dark:bg-slate-800/85'
        }`}
      >
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
