import { memo } from 'react';
import type { LinkMode } from '../../types/linkMode';
import { LINK_MODE_LABELS } from '../../types/linkMode';

interface LinkModeSelectorProps {
  linkMode: LinkMode;
  onChange: (mode: LinkMode) => void;
  disabled?: boolean;
}

const LINK_MODE_SCHEMA: Record<LinkMode, string> = {
  STAR_FORWARD:   'GW → 🛰 → User',
  STAR_RETURN:    'User → 🛰 → GW',
  MESH:           'A ↔ 🛰 ↔ B',
  POINT_TO_POINT: 'A ↔ 🛰 ↔ B · SCPC',
};

// Two topology families
const STAR_MODES: LinkMode[]  = ['STAR_FORWARD', 'STAR_RETURN'];
const P2P_MODES: LinkMode[]   = ['MESH', 'POINT_TO_POINT'];

// ─── Reusable mode button ─────────────────────────────────────────────────────

interface ModeButtonProps {
  mode: LinkMode;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}

const ModeButton = ({ mode, isActive, disabled, onClick }: ModeButtonProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={[
      'px-2 py-2 rounded text-left transition-colors leading-tight',
      isActive
        ? 'bg-blue-600 text-white shadow-sm'
        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ].join(' ')}
  >
    <p className="text-xs font-semibold leading-none">{LINK_MODE_LABELS[mode]}</p>
    <p className={`text-[10px] font-mono mt-0.5 leading-none ${isActive ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
      {LINK_MODE_SCHEMA[mode]}
    </p>
  </button>
);

// ─── Group header ─────────────────────────────────────────────────────────────

const GroupHeader = ({ label }: { label: string }) => (
  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
    {label}
  </p>
);

// ─── Main component ───────────────────────────────────────────────────────────

const LinkModeSelector = memo<LinkModeSelectorProps>(({
  linkMode,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-2.5">

      {/* STAR group */}
      <div>
        <GroupHeader label="STAR · Hub & Spoke" />
        <div className="grid grid-cols-2 gap-1">
          {STAR_MODES.map(mode => (
            <ModeButton
              key={mode}
              mode={mode}
              isActive={linkMode === mode}
              disabled={disabled}
              onClick={() => onChange(mode)}
            />
          ))}
        </div>
      </div>

      {/* Terminal-to-Terminal group */}
      <div>
        <GroupHeader label="Terminal-to-Terminal" />
        <div className="grid grid-cols-2 gap-1">
          {P2P_MODES.map(mode => (
            <ModeButton
              key={mode}
              mode={mode}
              isActive={linkMode === mode}
              disabled={disabled}
              onClick={() => onChange(mode)}
            />
          ))}
        </div>
      </div>

    </div>
  );
});

LinkModeSelector.displayName = 'LinkModeSelector';
export default LinkModeSelector;
