import { ChevronRight } from 'lucide-react';
import type { CommercialRouteSegment } from './commercialViewModel';

const statusClassName: Record<CommercialRouteSegment['status'], string> = {
  healthy: 'bg-emerald-500 text-white',
  warning: 'bg-amber-400 text-slate-950',
  blocked: 'bg-rose-500 text-white',
  unknown: 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

const statusLabel: Record<CommercialRouteSegment['status'], string> = {
  healthy: 'OK',
  warning: 'Check',
  blocked: 'Blocked',
  unknown: '--',
};

interface CommercialRouteStripProps {
  segments: CommercialRouteSegment[];
  selectedSegmentId: string;
  onSelectedSegmentChange: (segment: string) => void;
}

export default function CommercialRouteStrip({
  segments,
  selectedSegmentId,
  onSelectedSegmentChange,
}: CommercialRouteStripProps) {
  return (
    <div className="border-t border-slate-700 bg-slate-950/94 px-4 py-3 backdrop-blur">
      <div className="flex items-stretch gap-2 overflow-x-auto">
        {segments.map((segment, index) => (
          <div key={segment.id} className="flex min-w-[11rem] flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectedSegmentChange(segment.id)}
              className={[
                'flex w-full min-w-0 flex-col justify-center rounded-lg border px-3 py-2 text-left transition-colors',
                selectedSegmentId === segment.id
                  ? 'min-h-[6rem] border-sky-300 bg-sky-500/20 text-white shadow-[0_0_0_1px_rgba(125,211,252,0.3)]'
                  : 'min-h-[4.75rem] border-slate-800 bg-slate-900 text-slate-100 hover:bg-slate-800',
              ].join(' ')}
              aria-pressed={selectedSegmentId === segment.id}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{segment.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${statusClassName[segment.status]}`}>
                  {statusLabel[segment.status]}
                </span>
              </div>
              <div className="mt-1 truncate text-xs text-slate-400" title={segment.summary}>
                {segment.summary ?? '--'}
              </div>
              {selectedSegmentId === segment.id && (
                <div className="mt-2 space-y-1 text-xs leading-4 text-slate-300">
                  <div>{segment.story ?? 'This step contributes to the customer service path.'}</div>
                  <div className={segment.limitation ? 'text-amber-200' : 'text-emerald-200'}>
                    {segment.limitation ? `Limiting: ${segment.limitation}` : 'No limiting factor detected here'}
                  </div>
                </div>
              )}
            </button>
            {index < segments.length - 1 && (
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-700" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
