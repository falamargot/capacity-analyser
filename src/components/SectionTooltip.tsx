import { useState, useRef, useEffect } from 'react';

interface SectionTooltipProps {
  content: string;
}

export function SectionTooltip({ content }: SectionTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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
    <span ref={ref} className="relative inline-flex items-center ml-1.5 align-middle">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            setOpen(o => !o);
          }
        }}
        className="w-4 h-4 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-500 text-[10px] font-bold inline-flex items-center justify-center cursor-pointer select-none transition-colors leading-none"
        aria-label="Section info"
      >
        ?
      </span>
      {open && (
        <span className="absolute left-5 top-0 z-50 w-64 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 shadow-lg p-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-normal">
          {content}
        </span>
      )}
    </span>
  );
}
