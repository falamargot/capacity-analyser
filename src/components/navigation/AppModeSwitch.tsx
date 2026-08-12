import type { AppMode } from '../../hooks/useAppModeState';

interface AppModeSwitchProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  compact?: boolean;
  hud?: boolean;
  className?: string;
}

export function AppModeSwitch({
  currentMode,
  onModeChange,
  compact = false,
  hud = false,
  className = '',
}: AppModeSwitchProps) {
  return (
    <nav
      aria-label="Application mode"
      className={`inline-flex shrink-0 border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 ${hud ? 'rounded-[16px] p-0.5 text-[11px] shadow-sm' : compact ? 'rounded-[22px] p-1 text-[13px] shadow-sm' : 'rounded-xl p-1 text-sm'} ${className}`}
    >
      {([
        ['engineering', compact ? 'Eng' : 'Engineering'],
        ['commercial', compact ? 'Comm' : 'Commercial'],
        ['revisit', 'Revisit'],
      ] as const).map(([mode, label]) => (
        <span key={mode} className="contents">
          {mode === 'revisit' && (
            <span aria-hidden="true" className="mx-1 my-1.5 w-px bg-slate-300 dark:bg-slate-600" />
          )}
          <button
            type="button"
            onClick={() => onModeChange(mode)}
            className={[
              compact
                ? hud
                  ? 'rounded-[12px] px-2.5 py-1.5 font-semibold transition-colors'
                  : 'rounded-[16px] px-4 py-2.5 font-semibold transition-colors'
                : 'rounded-lg px-4 py-2.5 font-semibold transition-colors',
              currentMode === mode
                ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700',
            ].join(' ')}
            aria-pressed={currentMode === mode}
          >
            {label}
          </button>
        </span>
      ))}
    </nav>
  );
}
