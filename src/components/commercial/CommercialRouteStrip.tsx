import { ChevronRight } from 'lucide-react';
import type { CommercialRouteSegment } from './commercialViewModel';
import { customerServiceStateLabelShort, segmentStatusBadgeClassName } from './commercialDisplayUtils';

const journeyLabel: Record<CommercialRouteSegment['type'], string> = {
  access: 'Customer Site',
  satellite: 'Satellite Service',
  backhaul: 'Network Backbone',
  destination: 'Destination',
  summary: 'Service Outcome',
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
    <div className="border-t border-slate-800 bg-slate-950/94 px-5 py-4 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">Service Journey</div>
        </div>
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto">
        {segments.map((segment, index) => (
          <div key={segment.id} className="flex min-w-[12rem] flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectedSegmentChange(segment.id)}
              className={[
                'flex w-full min-w-0 flex-col justify-center rounded-lg border px-3.5 py-3 text-left transition-colors',
                selectedSegmentId === segment.id
                  ? 'min-h-[6.25rem] border-sky-300 bg-sky-500/20 text-white shadow-[0_0_0_1px_rgba(125,211,252,0.3)]'
                  : segment.isPrimaryIssue
                    ? 'min-h-[5rem] border-amber-300 bg-amber-500/15 text-white shadow-[0_0_0_1px_rgba(251,191,36,0.28)]'
                    : 'min-h-[5rem] border-slate-800 bg-slate-900/80 text-slate-100 hover:bg-slate-800',
              ].join(' ')}
              aria-pressed={selectedSegmentId === segment.id}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{journeyLabel[segment.type]}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${segmentStatusBadgeClassName[segment.status]}`}>
                  {customerServiceStateLabelShort[segment.customerStatus]}
                </span>
              </div>
              <div className="mt-1 truncate text-xs font-semibold text-sky-100" title={segment.title}>
                {segment.title}
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-400" title={segment.summary}>
                {segment.summary ?? segment.technicalSummary ?? '--'}
              </div>
              {selectedSegmentId === segment.id && (
                <div className="mt-2 space-y-1 text-xs leading-4 text-slate-300">
                  <div>{segment.story ?? 'This step contributes to the customer service path.'}</div>
                  <div className={segment.limitation ? 'text-amber-200' : 'text-emerald-200'}>
                    {segment.limitation ? `Constraint: ${segment.limitation}` : 'No constraint detected here'}
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
