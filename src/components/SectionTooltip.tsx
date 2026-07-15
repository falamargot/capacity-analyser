import { useState, useRef, useEffect, useId } from 'react';

interface SectionTooltipProps {
  content: string;
}

export function SectionTooltip({ content }: SectionTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span ref={ref} className="pointer-events-auto relative z-20 inline-flex items-center ml-1.5 align-middle">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            triggerRef.current?.focus();
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(o => !o);
          }
        }}
        className="w-4 h-4 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-500 text-[10px] font-bold inline-flex items-center justify-center cursor-pointer select-none transition-colors leading-none"
        aria-label={`Information: ${content}`}
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
      >
        ?
      </button>
      {open && (
        <span id={tooltipId} role="tooltip" className="absolute left-5 top-0 z-50 w-64 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 shadow-lg p-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-normal">
          {content}
        </span>
      )}
    </span>
  );
}
