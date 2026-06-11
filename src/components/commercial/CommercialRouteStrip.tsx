import { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';
import type { CommercialRouteSegment } from './commercialViewModel';
import { customerServiceStateLabelShort, segmentStatusBadgeClassName } from './commercialDisplayUtils';

const journeyLabel: Record<CommercialRouteSegment['type'], string> = {
  access: 'Customer Access',
  satellite: 'Serving Satellite',
  backhaul: 'Network Backbone',
  destination: 'Destination',
  summary: 'Connectivity Architecture',
};

function normalizeLabel(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function cardSubtitle(segment: CommercialRouteSegment): string {
  const title = journeyLabel[segment.type];
  const duplicateValues = new Set([
    normalizeLabel(title),
    normalizeLabel(segment.title),
  ]);
  const candidates = [
    segment.summary,
    segment.technicalSummary,
    segment.title,
    segment.story,
  ];

  return candidates.find((candidate) => {
    const normalized = normalizeLabel(candidate);
    return normalized.length > 0 && !duplicateValues.has(normalized);
  }) ?? '--';
}

function canonicalSegmentId(segment: CommercialRouteSegment): CommercialRouteSegmentId {
  switch (segment.type) {
    case 'access':
      return 'access';
    case 'satellite':
      return 'satellite';
    case 'backhaul':
      return 'backhaul';
    case 'destination':
      return 'destination';
    case 'summary':
      return 'summary';
  }
}

function orderedSegments(
  segments: CommercialRouteSegment[],
  commercialRouteModel: CommercialRouteModel | undefined,
): CommercialRouteSegment[] {
  const visibleSegments = segments.filter((segment) => segment.type !== 'backhaul');
  if (!commercialRouteModel) return visibleSegments;

  const fromFocusTargets = commercialRouteModel.focusTargets
    .map((target) => segments.find((segment) => canonicalSegmentId(segment) === target.segmentId))
    .filter((segment): segment is CommercialRouteSegment => segment !== undefined && segment.type !== 'backhaul');

  return fromFocusTargets.length === visibleSegments.length ? fromFocusTargets : visibleSegments;
}

interface CommercialRouteStripProps {
  segments: CommercialRouteSegment[];
  selectedSegmentId: string;
  commercialRouteModel?: CommercialRouteModel;
  onSelectedSegmentChange: (segment: string) => void;
}

function CommercialRouteStrip({
  segments,
  selectedSegmentId,
  commercialRouteModel,
  onSelectedSegmentChange,
}: CommercialRouteStripProps) {
  const displayedSegments = orderedSegments(segments, commercialRouteModel);
  const rawFocusedSegmentId = commercialRouteModel?.focusedSegmentId ?? selectedSegmentId;
  const focusedSegmentId = rawFocusedSegmentId === 'backhaul' ? 'summary' : rawFocusedSegmentId;
  const rawPrimaryFailingSegmentId = commercialRouteModel
    ? commercialRouteModel.primaryFailingSegmentId
    : undefined;
  const primaryFailingSegmentId = rawPrimaryFailingSegmentId === 'backhaul'
    ? 'summary'
    : rawPrimaryFailingSegmentId;

  return (
    <div className="border-t border-[rgba(148,163,184,0.08)] bg-[rgba(6,10,22,0.94)] px-4 py-1.5 backdrop-blur-xl">
      <div className="mb-0.5 flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-300">Service Journey</div>
        </div>
      </div>
      <div className="flex items-stretch gap-1.5">
        {displayedSegments.map((segment, index) => {
          const segmentId = canonicalSegmentId(segment);
          const isSelected = focusedSegmentId === segmentId || focusedSegmentId === segment.id;
          const isPrimaryIssue = primaryFailingSegmentId === undefined
            ? segment.isPrimaryIssue
            : primaryFailingSegmentId === segmentId;
          const isOutcome = segment.type === 'summary';
          const isAccess = segment.type === 'access';
          const subtitle = cardSubtitle(segment);
          return (
          <div key={segment.id} className={`flex min-w-0 items-center gap-1.5 ${isOutcome ? 'flex-[1.18]' : 'flex-1'}`}>
            <button
              type="button"
              onClick={() => onSelectedSegmentChange(segment.id)}
              className={[
                'flex w-full min-w-0 flex-col justify-center rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                isSelected
                  ? isAccess
                    ? 'min-h-[3.25rem] border-cyan-200/90 bg-cyan-400/20 text-white shadow-[0_0_0_1px_rgba(103,232,249,0.34),0_0_22px_rgba(34,211,238,0.28)]'
                    : 'min-h-[3.15rem] border-sky-300/80 bg-sky-500/20 text-white shadow-[0_0_0_1px_rgba(125,211,252,0.28),0_0_18px_rgba(56,189,248,0.22)]'
                  : isPrimaryIssue
                    ? 'min-h-[2.95rem] border-amber-400/60 bg-amber-500/12 text-white shadow-[0_0_0_1px_rgba(251,191,36,0.22),0_0_14px_rgba(251,191,36,0.16)]'
                    : isOutcome
                      ? 'min-h-[2.95rem] border-sky-500/30 bg-[rgba(15,23,42,0.70)] text-white hover:bg-[rgba(15,23,42,0.90)]'
                      : isAccess
                        ? 'min-h-[2.95rem] border-cyan-400/22 bg-cyan-400/8 text-slate-200 hover:bg-cyan-400/12'
                      : 'min-h-[2.95rem] border-[rgba(51,65,85,0.55)] bg-[rgba(15,23,42,0.55)] text-slate-300 hover:bg-[rgba(15,23,42,0.80)]',
              ].join(' ')}
              aria-pressed={isSelected}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className={`${isOutcome ? 'text-sm' : 'text-xs'} min-w-0 font-semibold leading-4 ${isSelected && isAccess ? 'text-cyan-50' : ''}`}>{journeyLabel[segment.type]}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${segmentStatusBadgeClassName[segment.status]}`}>
                  {customerServiceStateLabelShort[segment.customerStatus]}
                </span>
              </div>
              <div
                className={`mt-0.5 truncate text-[11px] ${isSelected && isAccess ? 'font-semibold text-cyan-100/85' : isOutcome ? 'font-semibold text-sky-100' : 'text-slate-400'}`}
                title={subtitle}
              >
                {subtitle}
              </div>
            </button>
            {index < displayedSegments.length - 1 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-700" />
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(CommercialRouteStrip);
