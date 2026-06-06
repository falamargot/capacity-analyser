import { memo } from 'react';
import type { TerminalCapability } from '../../components/commercial/commercialTypes';

function terminalLabel(terminal: TerminalCapability): string {
  const technology = terminal.technology.toUpperCase();
  if (terminal.technology === 'geo') {
    const terminalType = terminal.label?.trim() || 'VSAT';
    const detail = [terminal.band, terminalType].filter(Boolean).join(' ').trim();
    return `${technology} · ${detail || 'VSAT'}`;
  }
  const detail = terminal.model?.trim() || terminal.label?.trim() || 'Terminal';
  return `${technology} · ${detail}`;
}

function TerminalChip({ terminal }: { terminal: TerminalCapability }) {
  const isLeo = terminal.technology === 'leo';

  return (
    <span
      className={[
        'inline-flex h-5 max-w-full items-center rounded-full border px-1.5 text-[10px] font-semibold leading-none',
        isLeo
          ? 'border-sky-300/45 bg-sky-400/10 text-sky-100'
          : 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100',
      ].join(' ')}
      title={terminalLabel(terminal)}
    >
      <span className="min-w-0 truncate">{terminalLabel(terminal)}</span>
    </span>
  );
}

export interface SharedTerminalSelectorProps {
  terminals?: TerminalCapability[];
  showPlaceholder?: boolean;
}

function SharedTerminalSelector({ terminals, showPlaceholder = false }: SharedTerminalSelectorProps) {
  if (!terminals?.length) {
    return showPlaceholder ? (
      <span className="inline-flex h-5 items-center rounded-full border border-dashed border-slate-700/80 px-1.5 text-[10px] font-semibold leading-none text-slate-600">
        + Terminal
      </span>
    ) : null;
  }

  return (
    <>
      {terminals.map((terminal) => (
        <TerminalChip key={terminal.id} terminal={terminal} />
      ))}
    </>
  );
}

export default memo(SharedTerminalSelector);
