import { ChevronDown, ChevronUp } from 'lucide-react';

type DetailsTogglePillScope = 'workspace' | 'investigation';

interface DetailsTogglePillProps {
  scope: DetailsTogglePillScope;
}

const pillClassName = [
  'shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full',
  'border border-slate-700/80 bg-slate-900/70 px-2.5 py-1',
  'text-[10px] font-semibold leading-none text-slate-300',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  'transition-colors duration-150',
].join(' ');

const scopeClassName: Record<DetailsTogglePillScope, { collapsed: string; expanded: string; hover: string }> = {
  workspace: {
    collapsed: 'group-open/workspace:hidden',
    expanded: 'group-open/workspace:inline-flex',
    hover: 'group-hover/workspace:border-slate-500/80 group-hover/workspace:bg-slate-800/80 group-hover/workspace:text-slate-100',
  },
  investigation: {
    collapsed: 'group-open/investigation:hidden',
    expanded: 'group-open/investigation:inline-flex',
    hover: 'group-hover/investigation:border-slate-500/80 group-hover/investigation:bg-slate-800/80 group-hover/investigation:text-slate-100',
  },
};

const DetailsTogglePill = ({ scope }: DetailsTogglePillProps) => (
  <>
    <span className={`inline-flex ${pillClassName} ${scopeClassName[scope].hover} ${scopeClassName[scope].collapsed}`}>
      Show details
      <ChevronDown className="h-3 w-3" aria-hidden="true" />
    </span>
    <span className={`hidden ${pillClassName} ${scopeClassName[scope].hover} ${scopeClassName[scope].expanded}`}>
      Hide details
      <ChevronUp className="h-3 w-3" aria-hidden="true" />
    </span>
  </>
);

export default DetailsTogglePill;
