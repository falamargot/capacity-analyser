import { memo } from 'react';
import { ArrowLeftRight, MapPin, Route, Signal, Zap } from 'lucide-react';
import CollapsibleSection from '../layout/CollapsibleSection';
import { SectionTooltip } from '../SectionTooltip';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import { formatLeoSiteToSiteFailureReason } from '../../utils/leoSiteToSiteModel';

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmtMs = (v: number | null | undefined, d = 1) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(d)} ms` : '--';

const fmtMbps = (v: number | null | undefined) => {
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toFixed(0)} Mbps`;
};

const fmtKm = (v: number) => `${Math.round(v).toLocaleString()} km`;

const fmtDeg = (v: number | null | undefined) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(1)}°` : '--';

// ── Sub-components ────────────────────────────────────────────────────────────

const MetricRow = ({
  label,
  value,
  dimLabel,
  accent = false,
}: {
  label: string;
  value: string;
  dimLabel?: string;
  accent?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
      {label}
      {dimLabel && (
        <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500 italic">{dimLabel}</span>
      )}
    </span>
    <span
      className={`tabular-nums font-mono text-xs ${
        accent
          ? 'font-semibold text-pink-700 dark:text-pink-300'
          : 'text-slate-700 dark:text-slate-200'
      }`}
    >
      {value}
    </span>
  </div>
);

const StabilityBadge = ({ stability }: { stability: 'High' | 'Medium' | 'Low' }) => {
  const cfg = {
    High: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
    Medium: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
    Low: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  }[stability];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cfg}`}>
      {stability}
    </span>
  );
};

const ConfidenceBadge = ({ level }: { level: 'High' | 'Medium' | 'Low' }) => {
  const cfg = {
    High: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
    Medium: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    Low: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
  }[level];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cfg}`}>
      {level} confidence
    </span>
  );
};

// ── Path node ─────────────────────────────────────────────────────────────────

const PathNode = ({
  label,
  sub,
  color,
  icon,
}: {
  label: string;
  sub?: string;
  color: string;
  icon?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center gap-0.5 min-w-0 max-w-[4.5rem]">
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-white shrink-0"
      style={{ borderColor: color, backgroundColor: color + '33' }}
    >
      {icon ?? <span className="text-[9px] font-bold" style={{ color }}>{label[0]}</span>}
    </div>
    <span className="text-center text-[9px] font-semibold leading-tight break-words" style={{ color }}>
      {label}
    </span>
    {sub && (
      <span className="text-center text-[8px] text-slate-400 dark:text-slate-500 leading-tight break-words">
        {sub}
      </span>
    )}
  </div>
);

const PathArrow = ({ label, color }: { label?: string; color: string }) => (
  <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
    <div className="w-full flex items-center gap-0 relative">
      <div className="flex-1 h-px" style={{ backgroundColor: color }} />
      <span className="text-[8px] shrink-0" style={{ color }}>▶</span>
    </div>
    {label && (
      <span className="text-[8px] text-slate-400 dark:text-slate-500 text-center leading-tight truncate w-full text-center">
        {label}
      </span>
    )}
  </div>
);

// ── Unavailable state ─────────────────────────────────────────────────────────

const UnavailableState = ({ reason }: { reason: string }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-900/50">
    <Signal className="mx-auto mb-2 h-5 w-5 text-slate-400 dark:text-slate-500" />
    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Service Unavailable</p>
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{reason}</p>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

interface LeoSiteToSiteSectionProps {
  result: LeoSiteToSiteResult | null;
  /** Which direction is active in the A↔B direction tab. */
  direction?: 'A_TO_B' | 'B_TO_A';
}

const ACCENT = '#db2777'; // pink-600

const LeoSiteToSiteSection = memo<LeoSiteToSiteSectionProps>(({ result, direction = 'A_TO_B' }) => {
  if (!result) {
    return (
      <>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: ACCENT }}>
          <ArrowLeftRight className="h-5 w-5" />
          LEO Site-to-Site
          <SectionTooltip content="OneWeb logical site-to-site path: UT A → Satellite A → SNP A → Private backbone → SNP B → Satellite B → UT B. Routing is estimated — actual OneWeb backbone topology is proprietary." />
        </h3>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
          Place a second site on the globe to compute end-to-end connectivity.
        </div>
      </>
    );
  }

  const {
    servingSatelliteA,
    servingSatelliteB,
    selectedSnpA,
    selectedSnpB,
    logicalPop,
    userLinkLatencyAms,
    userLinkLatencyBms,
    feederLatencyAms,
    feederLatencyBms,
    backboneDistanceKm,
    backboneOneWayLatencyMs,
    processingMarginMs,
    oneWayLatencyAtoBMs,
    oneWayLatencyBtoAMs,
    rttMs,
    finalThroughputAtoBMbps,
    finalThroughputBtoAMbps,
    elevationADeg,
    elevationBDeg,
    expectedHandoversA,
    expectedHandoversB,
    pathStability,
    confidenceLevel,
    serviceAvailable,
    serviceStatus,
    failureReason,
  } = result;

  const isAtoB = direction === 'A_TO_B';
  const primaryThroughput = isAtoB ? finalThroughputAtoBMbps : finalThroughputBtoAMbps;
  const secondaryThroughput = isAtoB ? finalThroughputBtoAMbps : finalThroughputAtoBMbps;
  const primaryLatency = isAtoB ? oneWayLatencyAtoBMs : oneWayLatencyBtoAMs;
  const primaryLabel = isAtoB ? 'A → B' : 'B → A';
  const secondaryLabel = isAtoB ? 'B → A' : 'A → B';

  const snpAName = selectedSnpA?.name ?? '—';
  const snpBName = selectedSnpB?.name ?? '—';
  const satAName = servingSatelliteA?.name ?? '—';
  const satBName = servingSatelliteB?.name ?? '—';
  const popName = logicalPop?.name ?? 'Core PoP';

  const sameSNP = snpAName === snpBName && snpAName !== '—';

  return (
    <>
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: ACCENT }}>
        <ArrowLeftRight className="h-5 w-5" />
        LEO Site-to-Site
        <SectionTooltip content="OneWeb logical site-to-site path: UT A → Satellite A → SNP A → Private backbone → SNP B → Satellite B → UT B. Routing is estimated — actual OneWeb backbone topology is proprietary." />
      </h3>

      <div className="space-y-4">

        {/* ── Connectivity status ─────────────────────────────────────────── */}
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
          serviceStatus === 'ALLOWED'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-400'
            : serviceStatus === 'DEGRADED'
              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400'
        }`}>
          <span className={`h-2 w-2 rounded-full shrink-0 ${
            serviceStatus === 'ALLOWED'
              ? 'bg-emerald-500'
              : serviceStatus === 'DEGRADED'
                ? 'bg-amber-500'
                : 'bg-red-500'
          }`} />
          {serviceStatus === 'ALLOWED' ? 'Service Available' : serviceStatus === 'DEGRADED' ? 'Service Degraded' : 'Service Unavailable'}
        </div>

        {!serviceAvailable && (
          <UnavailableState
            reason={formatLeoSiteToSiteFailureReason(failureReason)}
          />
        )}

        {serviceAvailable && (
          <>
            {/* ── Path visualization ───────────────────────────────────────── */}
            <CollapsibleSection
              storageKey="leo-s2s-path"
              title={
                <>
                  <Route className="inline h-4 w-4 mr-1" />
                  Path
                  <SectionTooltip content="Logical OneWeb private IP backbone path between selected Satellite Network Portals. Actual routing is proprietary." />
                </>
              }
              accentColor={ACCENT}
              defaultOpen={true}
            >
              <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-1 min-w-0">
                <PathNode label="Site A" color="#06b6d4" icon={<MapPin className="h-3 w-3" style={{ color: '#06b6d4' }} />} />
                <PathArrow label="user link" color="#06b6d4" />
                <PathNode label={satAName} sub={`${fmtDeg(elevationADeg)} elev`} color="#06b6d4" />
                <PathArrow label="feeder" color="#f97316" />
                <PathNode label={`SNP ${snpAName}`} color="#f97316" />
                {!sameSNP ? (
                  <>
                    <PathArrow label="backbone" color="#8b5cf6" />
                    <PathNode
                      label={popName}
                      sub="PoP"
                      color="#f5f0ff"
                      icon={<span className="text-[8px] font-bold" style={{ color: '#8b5cf6' }}>PoP</span>}
                    />
                    <PathArrow label="backbone" color="#8b5cf6" />
                    <PathNode label={`SNP ${snpBName}`} color="#f97316" />
                  </>
                ) : (
                  <div className="mx-1 text-[9px] text-slate-400 italic shrink-0">same SNP</div>
                )}
                <PathArrow label="feeder" color="#f97316" />
                <PathNode label={satBName} sub={`${fmtDeg(elevationBDeg)} elev`} color="#06b6d4" />
                <PathArrow label="user link" color="#06b6d4" />
                <PathNode label="Site B" color="#06b6d4" icon={<MapPin className="h-3 w-3" style={{ color: '#06b6d4' }} />} />
              </div>

              {/* PoP tooltip notice */}
              <div className="mt-2 rounded-md border border-violet-200/70 bg-violet-50/60 px-2.5 py-1.5 text-[10px] text-violet-700 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-300">
                <span className="font-semibold">Logical PoP: {popName}.</span>{' '}
                Logical Point of Presence representing OneWeb core interconnect. Actual routing is proprietary.
              </div>
            </CollapsibleSection>

            {/* ── Performance ─────────────────────────────────────────────── */}
            <CollapsibleSection
              storageKey="leo-s2s-performance"
              title={
                <>
                  <Zap className="inline h-4 w-4 mr-1" />
                  Performance
                </>
              }
              accentColor={ACCENT}
              defaultOpen={true}
            >
              <div className="space-y-1">
                <div className="mb-2 rounded border border-pink-200 bg-pink-50 px-2 py-1 text-[10px] text-pink-700 dark:border-pink-800/50 dark:bg-pink-950/30 dark:text-pink-300">
                  Throughput is the access-link bottleneck. Backbone capacity is assumed non-limiting.
                </div>

                {/* Primary direction — highlighted */}
                <div className="flex items-center gap-2 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide w-16 shrink-0" style={{ color: ACCENT }}>{primaryLabel}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: ACCENT }}>
                    {fmtMbps(primaryThroughput)}
                  </span>
                </div>
                {/* Secondary direction — dimmed */}
                <div className="flex items-center gap-2 py-0.5 opacity-50">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 w-16 shrink-0">{secondaryLabel}</span>
                  <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {fmtMbps(secondaryThroughput)}
                  </span>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-2 mt-1 space-y-0.5">
                  <MetricRow label={`One-way latency (${primaryLabel})`} value={fmtMs(primaryLatency)} accent />
                  <MetricRow label="Round-trip reference" value={fmtMs(rttMs)} accent />
                </div>
              </div>
            </CollapsibleSection>

            {/* ── Latency breakdown ────────────────────────────────────────── */}
            <CollapsibleSection
              storageKey="leo-s2s-latency"
              title="Latency Breakdown"
              accentColor={ACCENT}
              defaultOpen={false}
            >
              <div className="space-y-0.5 text-xs">
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400 mb-2">
                  Propagation delays derived from slant range (speed of light). Backbone uses geodesic × {1.2} / fiber speed.
                </div>
                <div className="font-semibold text-slate-700 dark:text-slate-200 text-xs mt-2 mb-1">Radio hops</div>
                <MetricRow label="UT A → Satellite A" value={fmtMs(userLinkLatencyAms)} />
                <MetricRow label="Satellite A → SNP A" value={fmtMs(feederLatencyAms)} />
                {!sameSNP && (
                  <>
                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-xs mt-2 mb-1">Backbone</div>
                    <MetricRow
                      label={`SNP ${snpAName} → ${popName} → SNP ${snpBName}`}
                      value={fmtMs(backboneOneWayLatencyMs)}
                    />
                    <MetricRow
                      label="Backbone distance (inflated)"
                      value={fmtKm(backboneDistanceKm)}
                      dimLabel="×1.2 route factor"
                    />
                  </>
                )}
                <MetricRow label="SNP B → Satellite B" value={fmtMs(feederLatencyBms)} />
                <MetricRow label="Satellite B → UT B" value={fmtMs(userLinkLatencyBms)} />
                <div className="font-semibold text-slate-700 dark:text-slate-200 text-xs mt-2 mb-1">Overhead</div>
                <MetricRow label="Processing margin" value={fmtMs(processingMarginMs, 0)} />
                <div className="border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                  <MetricRow label={`One-way latency (${primaryLabel})`} value={fmtMs(primaryLatency)} accent />
                  <MetricRow label="Round-trip reference" value={fmtMs(rttMs)} accent />
                </div>
              </div>
            </CollapsibleSection>

            {/* ── Stability ────────────────────────────────────────────────── */}
            <CollapsibleSection
              storageKey="leo-s2s-stability"
              title={
                <>
                  Stability
                  <SectionTooltip content="Qualitative estimate based on satellite elevation and motion. Higher elevation → satellite near pass apex → more stable. Expected handovers are estimated for the next 15 minutes." />
                </>
              }
              accentColor={ACCENT}
              defaultOpen={false}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Path stability</span>
                  <StabilityBadge stability={pathStability} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Model confidence</span>
                  <ConfidenceBadge level={confidenceLevel} />
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-0.5">
                  <MetricRow
                    label="Site A elevation"
                    value={fmtDeg(elevationADeg)}
                  />
                  <MetricRow
                    label="Site B elevation"
                    value={fmtDeg(elevationBDeg)}
                  />
                  <MetricRow
                    label="Expected handovers A (~15 min)"
                    value={String(expectedHandoversA)}
                  />
                  <MetricRow
                    label="Expected handovers B (~15 min)"
                    value={String(expectedHandoversB)}
                  />
                </div>
                <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300 mt-1">
                  Stability is a qualitative estimate. Actual handover timing depends on constellation geometry at the time of use.
                </div>
              </div>
            </CollapsibleSection>
          </>
        )}
      </div>
    </>
  );
});

LeoSiteToSiteSection.displayName = 'LeoSiteToSiteSection';
export default LeoSiteToSiteSection;
