import { memo, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Network,
  RadioTower,
  Route,
  Satellite,
  SatelliteDish,
  Star,
  Target,
  Timer,
  X,
} from 'lucide-react';
import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import {
  buildCommercialNarrativeCardModel,
  type CommercialNarrativeCardModel,
} from './commercialNarrativeModel';
import { formatMbps, formatMs, commServiceStatusLabel } from './commercialDisplayUtils';
import {
  SignalQualityBar,
  qualityFromText,
  ForecastConfidenceGauge,
  confidenceLevelFromPrediction,
  EndToEndPathDiagram,
  UseCaseFitGrid,
  CommercialKpiTile,
  downloadSpeedTier,
  uploadSpeedTier,
  responseTimeTier,
  reliabilityTier,
  type PathNode,
} from './CommercialVisuals';

export interface CommercialNarrativePanelProps {
  viewModel: CommercialScenarioViewModel;
  selectedSegmentId: string;
  commercialRouteModel?: CommercialRouteModel;
  isOpen: boolean;
  onClose?: () => void;
  onViewFullAnalysis?: () => void;
}

const SEGMENT_ORDER: CommercialRouteSegmentId[] = [
  'access',
  'satellite',
  'destination',
  'summary',
];

function toSegmentId(value: string): CommercialRouteSegmentId {
  if (value === 'siteB') return 'destination';
  if (value === 'backhaul') return 'summary';
  if (
    value === 'access'
    || value === 'satellite'
    || value === 'destination'
    || value === 'summary'
  ) {
    return value;
  }
  return 'summary';
}

const statusBadgeClass: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-emerald-300/45 bg-emerald-400/15 text-emerald-100',
  warning: 'border-amber-300/50 bg-amber-400/15 text-amber-100',
  danger: 'border-rose-300/50 bg-rose-400/15 text-rose-100',
  neutral: 'border-slate-500/55 bg-slate-700/40 text-slate-200',
};

const accessStatusBadgeClass: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-cyan-200/70 bg-cyan-400/16 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.18)]',
  warning: 'border-cyan-200/55 bg-cyan-400/12 text-cyan-50',
  danger: 'border-rose-300/50 bg-rose-400/15 text-rose-100',
  neutral: 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100',
};

const noteClass: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-emerald-300/35 bg-emerald-400/12 text-emerald-50',
  warning: 'border-amber-300/40 bg-amber-400/12 text-amber-50',
  danger: 'border-rose-300/40 bg-rose-400/12 text-rose-50',
  neutral: 'border-sky-300/30 bg-sky-400/10 text-sky-50',
};

const segmentIcon: Record<CommercialRouteSegmentId, ReactNode> = {
  access: <RadioTower className="h-4 w-4" aria-hidden="true" />,
  satellite: <Satellite className="h-4 w-4" aria-hidden="true" />,
  backhaul: <Network className="h-4 w-4" aria-hidden="true" />,
  destination: <Target className="h-4 w-4" aria-hidden="true" />,
  summary: <Route className="h-4 w-4" aria-hidden="true" />,
};

function NoteIcon({ tone }: { tone: CommercialNarrativeCardModel['statusTone'] }) {
  if (tone === 'good') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-200" aria-hidden="true" />;
  if (tone === 'warning' || tone === 'danger') return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" />;
  return <Route className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />;
}

function cleanVal(value: string | undefined | null): string | undefined {
  const t = value?.trim();
  if (!t || t === '--') return undefined;
  return t;
}

// ─── Shared inline fact row ───────────────────────────────────────────────────

function FactRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'neutral' | 'warning';
}) {
  const valueColor = tone === 'good' ? 'text-emerald-200' : tone === 'warning' ? 'text-amber-200' : 'text-slate-100/80';
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2.5 text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <span className="font-semibold text-slate-200">{label}</span>
      <span className={`max-w-[10rem] truncate text-right font-medium ${valueColor}`}>{value}</span>
    </div>
  );
}

// ─── Existing architecture diagrams (kept as-is) ─────────────────────────────

function GeoArchitectureDiagram() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-blue-200/20 bg-[radial-gradient(circle_at_50%_32%,rgba(96,165,250,0.22),transparent_48%),linear-gradient(180deg,rgba(14,20,52,0.72),rgba(15,23,42,0.80))]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 340 180" className="w-full" style={{ display: 'block' }}>
        <ellipse cx="170" cy="48" rx="28" ry="18" fill="rgba(96,165,250,0.20)" />
        <line x1="44" y1="128" x2="170" y2="48" stroke="rgba(96,165,250,0.52)" strokeWidth="1.5" strokeDasharray="5,4" />
        <line x1="170" y1="48" x2="296" y2="128" stroke="rgba(139,92,246,0.48)" strokeWidth="1.5" strokeDasharray="5,4" />
        <circle cx="107" cy="88" r="2.8" fill="rgba(147,197,253,0.90)" />
        <circle cx="107" cy="88" r="5" fill="none" stroke="rgba(147,197,253,0.28)" strokeWidth="1" />
        <circle cx="233" cy="88" r="2.8" fill="rgba(167,139,250,0.85)" />
        <circle cx="233" cy="88" r="5" fill="none" stroke="rgba(167,139,250,0.26)" strokeWidth="1" />
        <circle cx="170" cy="48" r="24" fill="rgba(22,46,120,0.52)" stroke="rgba(96,165,250,0.48)" strokeWidth="1.2" />
        <rect x="162" y="42" width="16" height="10" rx="2" fill="none" stroke="rgba(147,197,253,0.92)" strokeWidth="1.3" />
        <line x1="157" y1="47" x2="162" y2="47" stroke="rgba(147,197,253,0.85)" strokeWidth="1.8" />
        <line x1="178" y1="47" x2="183" y2="47" stroke="rgba(147,197,253,0.85)" strokeWidth="1.8" />
        <text x="170" y="82" textAnchor="middle" fill="rgba(147,197,253,0.80)" fontSize="7.5" fontWeight="700" letterSpacing="2">GEO SAT</text>
        <circle cx="44" cy="128" r="22" fill="rgba(8,47,73,0.52)" stroke="rgba(34,211,238,0.38)" strokeWidth="1.2" />
        <path d="M37 133 Q44 124 51 133" fill="none" stroke="rgba(34,211,238,0.88)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="44" y1="133" x2="44" y2="138" stroke="rgba(34,211,238,0.65)" strokeWidth="1.3" />
        <line x1="40" y1="138" x2="48" y2="138" stroke="rgba(34,211,238,0.48)" strokeWidth="1.1" />
        <text x="44" y="160" textAnchor="middle" fill="rgba(34,211,238,0.82)" fontSize="7.5" fontWeight="700" letterSpacing="2">SITE A</text>
        <text x="44" y="171" textAnchor="middle" fill="rgba(34,211,238,0.46)" fontSize="6.5" fontWeight="600" letterSpacing="1">Uplink</text>
        <circle cx="296" cy="128" r="22" fill="rgba(46,16,101,0.48)" stroke="rgba(139,92,246,0.38)" strokeWidth="1.2" />
        <circle cx="296" cy="128" r="9" fill="none" stroke="rgba(167,139,250,0.82)" strokeWidth="1.3" />
        <circle cx="296" cy="128" r="4" fill="none" stroke="rgba(167,139,250,0.78)" strokeWidth="1.3" />
        <circle cx="296" cy="128" r="1.5" fill="rgba(167,139,250,0.95)" />
        <text x="296" y="160" textAnchor="middle" fill="rgba(167,139,250,0.82)" fontSize="7.5" fontWeight="700" letterSpacing="2">SITE B</text>
        <text x="296" y="171" textAnchor="middle" fill="rgba(167,139,250,0.46)" fontSize="6.5" fontWeight="600" letterSpacing="1">Downlink</text>
        <text x="170" y="178" textAnchor="middle" fill="rgba(96,165,250,0.30)" fontSize="6.5" fontWeight="700" letterSpacing="3">DIRECT SATELLITE RELAY</text>
      </svg>
    </div>
  );
}

function LeoArchitectureDiagram() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-fuchsia-200/18 bg-[radial-gradient(ellipse_at_50%_28%,rgba(217,70,239,0.15),transparent_48%),linear-gradient(180deg,rgba(18,10,40,0.78),rgba(15,23,42,0.82))]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 340 196" className="w-full" style={{ display: 'block' }}>
        <ellipse cx="110" cy="44" rx="20" ry="14" fill="rgba(217,70,239,0.16)" />
        <ellipse cx="230" cy="44" rx="20" ry="14" fill="rgba(217,70,239,0.16)" />
        <line x1="24" y1="55" x2="110" y2="44" stroke="rgba(34,211,238,0.52)" strokeWidth="1.5" strokeDasharray="4,3" />
        <line x1="110" y1="64" x2="110" y2="128" stroke="rgba(217,70,239,0.48)" strokeWidth="1.2" strokeDasharray="3,3" />
        <line x1="136" y1="139" x2="204" y2="139" stroke="rgba(99,102,241,0.65)" strokeWidth="2" strokeDasharray="5,3" />
        <line x1="230" y1="128" x2="230" y2="64" stroke="rgba(217,70,239,0.48)" strokeWidth="1.2" strokeDasharray="3,3" />
        <line x1="230" y1="44" x2="316" y2="55" stroke="rgba(139,92,246,0.52)" strokeWidth="1.5" strokeDasharray="4,3" />
        <circle cx="110" cy="44" r="20" fill="rgba(88,28,135,0.48)" stroke="rgba(217,70,239,0.45)" strokeWidth="1.2" />
        <rect x="103" y="38" width="14" height="9" rx="1.5" fill="none" stroke="rgba(240,171,252,0.88)" strokeWidth="1.2" />
        <line x1="99" y1="42.5" x2="103" y2="42.5" stroke="rgba(240,171,252,0.80)" strokeWidth="1.6" />
        <line x1="117" y1="42.5" x2="121" y2="42.5" stroke="rgba(240,171,252,0.80)" strokeWidth="1.6" />
        <text x="110" y="74" textAnchor="middle" fill="rgba(240,171,252,0.75)" fontSize="6.5" fontWeight="700" letterSpacing="1">LEO SAT A</text>
        <circle cx="230" cy="44" r="20" fill="rgba(88,28,135,0.48)" stroke="rgba(217,70,239,0.45)" strokeWidth="1.2" />
        <rect x="223" y="38" width="14" height="9" rx="1.5" fill="none" stroke="rgba(240,171,252,0.88)" strokeWidth="1.2" />
        <line x1="219" y1="42.5" x2="223" y2="42.5" stroke="rgba(240,171,252,0.80)" strokeWidth="1.6" />
        <line x1="237" y1="42.5" x2="241" y2="42.5" stroke="rgba(240,171,252,0.80)" strokeWidth="1.6" />
        <text x="230" y="74" textAnchor="middle" fill="rgba(240,171,252,0.75)" fontSize="6.5" fontWeight="700" letterSpacing="1">LEO SAT B</text>
        <rect x="97" y="128" width="26" height="22" rx="4" fill="rgba(49,46,129,0.52)" stroke="rgba(99,102,241,0.50)" strokeWidth="1" />
        <circle cx="110" cy="135" r="2" fill="rgba(129,140,248,0.88)" />
        <circle cx="104" cy="144" r="1.6" fill="rgba(129,140,248,0.70)" />
        <circle cx="116" cy="144" r="1.6" fill="rgba(129,140,248,0.70)" />
        <line x1="110" y1="137" x2="104" y2="142" stroke="rgba(129,140,248,0.52)" strokeWidth="1" />
        <line x1="110" y1="137" x2="116" y2="142" stroke="rgba(129,140,248,0.52)" strokeWidth="1" />
        <text x="110" y="162" textAnchor="middle" fill="rgba(129,140,248,0.62)" fontSize="6" fontWeight="700" letterSpacing="1">NETWORK</text>
        <rect x="217" y="128" width="26" height="22" rx="4" fill="rgba(49,46,129,0.52)" stroke="rgba(99,102,241,0.50)" strokeWidth="1" />
        <circle cx="230" cy="135" r="2" fill="rgba(129,140,248,0.88)" />
        <circle cx="224" cy="144" r="1.6" fill="rgba(129,140,248,0.70)" />
        <circle cx="236" cy="144" r="1.6" fill="rgba(129,140,248,0.70)" />
        <line x1="230" y1="137" x2="224" y2="142" stroke="rgba(129,140,248,0.52)" strokeWidth="1" />
        <line x1="230" y1="137" x2="236" y2="142" stroke="rgba(129,140,248,0.52)" strokeWidth="1" />
        <text x="230" y="162" textAnchor="middle" fill="rgba(129,140,248,0.62)" fontSize="6" fontWeight="700" letterSpacing="1">NETWORK</text>
        <text x="170" y="132" textAnchor="middle" fill="rgba(129,140,248,0.52)" fontSize="6.5" fontWeight="700" letterSpacing="2">BACKBONE</text>
        <circle cx="24" cy="55" r="19" fill="rgba(8,47,73,0.52)" stroke="rgba(34,211,238,0.38)" strokeWidth="1.1" />
        <path d="M17 60 Q24 51 31 60" fill="none" stroke="rgba(34,211,238,0.88)" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="24" y1="60" x2="24" y2="65" stroke="rgba(34,211,238,0.62)" strokeWidth="1.2" />
        <line x1="20" y1="65" x2="28" y2="65" stroke="rgba(34,211,238,0.46)" strokeWidth="1.0" />
        <text x="24" y="84" textAnchor="middle" fill="rgba(34,211,238,0.80)" fontSize="7" fontWeight="700" letterSpacing="2">SITE A</text>
        <circle cx="316" cy="55" r="19" fill="rgba(46,16,101,0.48)" stroke="rgba(139,92,246,0.38)" strokeWidth="1.1" />
        <circle cx="316" cy="55" r="8" fill="none" stroke="rgba(167,139,250,0.82)" strokeWidth="1.2" />
        <circle cx="316" cy="55" r="3.5" fill="none" stroke="rgba(167,139,250,0.78)" strokeWidth="1.2" />
        <circle cx="316" cy="55" r="1.2" fill="rgba(167,139,250,0.96)" />
        <text x="316" y="84" textAnchor="middle" fill="rgba(167,139,250,0.80)" fontSize="7" fontWeight="700" letterSpacing="2">SITE B</text>
        <text x="170" y="192" textAnchor="middle" fill="rgba(217,70,239,0.28)" fontSize="6.5" fontWeight="700" letterSpacing="3">LEO RELAY CHAIN</text>
      </svg>
    </div>
  );
}

// ─── Step 1: Origin Site ──────────────────────────────────────────────────────

function AccessSignalDiagram() {
  return (
    <div
      className="relative h-24 overflow-hidden rounded-lg border border-cyan-300/22 bg-[radial-gradient(circle_at_26%_50%,rgba(34,211,238,0.22),transparent_28%),linear-gradient(180deg,rgba(8,47,73,0.24),rgba(15,23,42,0.26))]"
      aria-hidden="true"
    >
      <div className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-100/54 to-sky-100/10" />
      <div className="absolute left-[4.7rem] top-[2.85rem] h-2 w-2 rounded-full bg-cyan-100 shadow-[0_0_14px_rgba(165,243,252,0.86)] access-signal-dot" />
      <div className="absolute left-7 top-5 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-200/35 bg-cyan-300/12 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.22)] access-signal-ring">
        <SatelliteDish className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="absolute right-7 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-sky-200/24 bg-sky-300/10 text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.15)]">
        <Satellite className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="absolute bottom-3 left-7 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-100/75">
        Your site
      </div>
      <div className="absolute bottom-3 right-7 text-right text-[9px] font-bold uppercase tracking-[0.14em] text-sky-100/70">
        Satellite
      </div>
    </div>
  );
}

function OriginSiteBlock({
  card,
  viewModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
}) {
  const isGeo = viewModel.commercialDisplayTechnology === 'GEO';
  const isReady = card.statusTone === 'good';
  const siteName = cleanVal(viewModel.siteA?.name) ?? 'Origin site';
  const weatherA = cleanVal(viewModel.display.weatherA);
  const weatherImpact = weatherA
    ? (weatherA.toLowerCase().includes('clear') || weatherA.toLowerCase().includes('fair') ? 'None expected' : `${weatherA}`)
    : 'None expected';

  const rows = [
    { label: 'Location', value: siteName },
    { label: 'Service type', value: isGeo ? 'GEO satellite broadband' : 'LEO satellite broadband' },
    { label: 'Signal verified', value: isReady ? 'Confirmed' : 'Pending' },
    { label: 'Weather impact', value: weatherImpact },
    { label: 'Coverage confidence', value: isReady ? 'High' : 'Pending' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-300/30 bg-[linear-gradient(180deg,rgba(8,47,73,0.34),rgba(15,23,42,0.44))] p-3.5 shadow-[0_0_48px_rgba(34,211,238,0.11),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <AccessSignalDiagram />
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-cyan-100/20 to-transparent" />
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/60">
            {isGeo ? 'GEO Access' : 'LEO Access'}
          </div>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] leading-none ${accessStatusBadgeClass[card.statusTone]}`}>
            {card.statusLabel}
          </span>
        </div>
      </div>

      <section>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-200/65">Site Readiness</div>
        <div className="space-y-1.5">
          {rows.map(({ label, value }) => (
            <FactRow
              key={label}
              label={label}
              value={value}
              tone={
                value === 'Confirmed' || value === 'High' || value === 'None expected'
                  ? 'good'
                  : value === 'Pending'
                    ? 'neutral'
                    : 'neutral'
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Step 2: Space Coverage ───────────────────────────────────────────────────

function GeoServingDiagram() {
  return (
    <div className="relative mx-auto h-32 max-w-[16rem] overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-4 h-16 w-16 -translate-x-1/2 rounded-full bg-blue-300/12 blur-xl satellite-service-breathe" />
      <div className="absolute left-1/2 top-7 h-11 w-11 -translate-x-1/2 rounded-full border border-blue-200/25 bg-indigo-400/10 satellite-service-breathe" />
      <div className="absolute left-1/2 top-[2.35rem] h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.85),0_0_38px_rgba(96,165,250,0.70)]" />
      <div className="absolute left-1/2 top-[3.75rem] -translate-x-1/2 text-[9px] font-bold uppercase tracking-[0.18em] text-blue-100/70">GEO</div>
      <div className="absolute left-[4.25rem] top-[4.35rem] h-16 w-px -rotate-[31deg] bg-gradient-to-t from-cyan-200/70 via-blue-200/32 to-transparent shadow-[0_0_14px_rgba(96,165,250,0.18)]" />
      <div className="absolute right-[4.25rem] top-[4.35rem] h-16 w-px rotate-[31deg] bg-gradient-to-b from-blue-200/60 via-violet-200/30 to-transparent shadow-[0_0_14px_rgba(96,165,250,0.18)]" />
      <div className="absolute bottom-4 left-4 flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/22 bg-cyan-300/9 text-cyan-100">
        <SatelliteDish className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-violet-200/22 bg-indigo-300/10 text-violet-100">
        <Target className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="absolute bottom-7 left-[4.25rem] text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-100/70">Uplink</div>
      <div className="absolute bottom-7 right-[4rem] text-[9px] font-bold uppercase tracking-[0.12em] text-violet-100/70">Downlink</div>
    </div>
  );
}

function LeoEndpointDiagram({ side }: { side: 'A' | 'B' }) {
  const satelliteLeft = side === 'B';
  return (
    <div className="relative h-20 overflow-hidden rounded-lg border border-indigo-200/14 bg-[radial-gradient(circle_at_50%_30%,rgba(147,197,253,0.16),transparent_34%),linear-gradient(180deg,rgba(30,41,91,0.20),rgba(15,23,42,0.22))]" aria-hidden="true">
      <div className="absolute left-8 right-8 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-blue-100/48 to-transparent" />
      <div className={['absolute top-4 flex h-11 w-11 items-center justify-center rounded-full border border-blue-200/24 bg-indigo-400/10 text-blue-100 satellite-service-breathe', satelliteLeft ? 'left-7' : 'right-7'].join(' ')}>
        <div className="absolute h-14 w-14 rounded-full bg-blue-300/10 blur-xl" />
        <Satellite className="relative h-5 w-5 drop-shadow-[0_0_10px_rgba(147,197,253,0.65)]" aria-hidden="true" />
      </div>
      <div className={['absolute top-5 flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/8 text-cyan-100', satelliteLeft ? 'right-8' : 'left-8'].join(' ')}>
        {side === 'A' ? <SatelliteDish className="h-5 w-5" aria-hidden="true" /> : <Target className="h-4 w-4" aria-hidden="true" />}
      </div>
      <div className="absolute left-1/2 top-[2.2rem] h-2 w-2 -translate-x-1/2 rounded-full bg-blue-100 shadow-[0_0_12px_rgba(147,197,253,0.8)]" />
    </div>
  );
}

function GeoSpaceCoverageBlock({
  card,
  viewModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
}) {
  const satelliteName = cleanVal(viewModel.display.satelliteName) ?? 'Selected GEO satellite';
  const siteAName = cleanVal(viewModel.siteA?.name) ?? 'Your location';
  const siteBName = cleanVal(viewModel.siteB?.name) ?? 'Destination';
  const linkQuality = qualityFromText(viewModel.display.rfStatus ?? viewModel.display.linkQualityA);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-300/28 bg-[radial-gradient(circle_at_50%_18%,rgba(147,197,253,0.22),transparent_34%),linear-gradient(180deg,rgba(30,41,91,0.36),rgba(15,23,42,0.48))] p-4 shadow-[0_0_46px_rgba(99,102,241,0.12),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <GeoServingDiagram />
        <div className="mt-1.5 text-center text-[9px] font-bold uppercase tracking-[0.22em] text-blue-300/45">Direct GEO Relay</div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-100/60">Serving satellite</div>
        <div className="mt-1 truncate text-[18px] font-bold text-white">{satelliteName}</div>
        <p className="mt-3 text-[14px] font-semibold leading-[1.55] text-white/80">{card.narrativeStatement}</p>
      </div>

      <section>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-200/65">Coverage confirmation</div>
        <div className="space-y-1.5">
          <FactRow label={siteAName} value={card.statusTone === 'good' ? 'Covered' : 'Pending'} tone={card.statusTone === 'good' ? 'good' : 'neutral'} />
          <FactRow label={siteBName} value={card.statusTone === 'good' ? 'Covered' : 'Pending'} tone={card.statusTone === 'good' ? 'good' : 'neutral'} />
          <FactRow label="Satellite capacity" value={card.statusTone === 'good' ? 'Available' : 'Pending'} tone={card.statusTone === 'good' ? 'good' : 'neutral'} />
        </div>
        {linkQuality !== 'unknown' && (
          <div className="mt-2 rounded-lg border border-indigo-200/16 bg-indigo-400/8 px-3 py-2.5">
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-200/65">Signal quality</div>
            <SignalQualityBar quality={linkQuality} />
          </div>
        )}
      </section>

      <div className="rounded-lg border border-blue-300/20 bg-blue-950/20 px-3 py-2.5 text-[12px] text-blue-100/80">
        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-200/60">Note</div>
        <p className="mt-1 leading-5">GEO provides continuous coverage from a fixed orbital position. Higher response time than LEO — best suited for broadcast, backup and data transfer workloads.</p>
      </div>
    </div>
  );
}

function LeoSpaceCoverageBlock({
  card,
  viewModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
}) {
  const siteASatellite = cleanVal(viewModel.display.satelliteNameA) ?? cleanVal(viewModel.display.satelliteName) ?? 'Coverage satellite';
  const siteBSatellite = cleanVal(viewModel.display.satelliteNameB) ?? 'Coverage satellite';
  const siteAName = cleanVal(viewModel.siteA?.name) ?? 'Your location';
  const siteBName = cleanVal(viewModel.siteB?.name) ?? 'Destination';
  const qualityA = qualityFromText(viewModel.display.linkQualityA);
  const qualityB = qualityFromText(viewModel.display.linkQualityB);
  const bandwidthA = cleanVal(viewModel.display.capacityContributionA);
  const bandwidthB = cleanVal(viewModel.display.capacityContributionB);

  return (
    <div className="space-y-3">
      {/* Site A satellite card */}
      <div className="rounded-lg border border-indigo-300/24 bg-[radial-gradient(circle_at_50%_18%,rgba(147,197,253,0.16),transparent_32%),linear-gradient(180deg,rgba(30,41,91,0.30),rgba(15,23,42,0.42))] p-3.5 shadow-[0_0_34px_rgba(99,102,241,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-100/60">{siteAName} coverage satellite</div>
        <div className="truncate text-[15px] font-bold text-white">{siteASatellite}</div>
        <LeoEndpointDiagram side="A" />
        <div className="mt-2 space-y-1.5">
          <FactRow label="Visibility" value={card.statusTone === 'good' ? 'Active' : 'Pending'} tone={card.statusTone === 'good' ? 'good' : 'neutral'} />
          {bandwidthA && <FactRow label="Bandwidth contribution" value={bandwidthA} />}
        </div>
        {qualityA !== 'unknown' && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-indigo-200/60">Signal quality</span>
            <SignalQualityBar quality={qualityA} />
          </div>
        )}
      </div>

      {/* Site B satellite card */}
      <div className="rounded-lg border border-indigo-300/24 bg-[radial-gradient(circle_at_50%_18%,rgba(147,197,253,0.16),transparent_32%),linear-gradient(180deg,rgba(30,41,91,0.30),rgba(15,23,42,0.42))] p-3.5 shadow-[0_0_34px_rgba(99,102,241,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-100/60">{siteBName} coverage satellite</div>
        <div className="truncate text-[15px] font-bold text-white">{siteBSatellite}</div>
        <LeoEndpointDiagram side="B" />
        <div className="mt-2 space-y-1.5">
          <FactRow label="Visibility" value={card.statusTone === 'good' ? 'Active' : 'Pending'} tone={card.statusTone === 'good' ? 'good' : 'neutral'} />
          {bandwidthB && <FactRow label="Bandwidth contribution" value={bandwidthB} />}
        </div>
        {qualityB !== 'unknown' && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-indigo-200/60">Signal quality</span>
            <SignalQualityBar quality={qualityB} />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-indigo-300/20 bg-[linear-gradient(135deg,rgba(79,70,229,0.16),rgba(30,64,175,0.10))] p-3 text-indigo-50">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-200" aria-hidden="true" />
          <p className="text-[12px] font-semibold leading-[1.5]">{card.businessNote}</p>
        </div>
      </div>
    </div>
  );
}

function SpaceCoverageBlock({
  card,
  viewModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
}) {
  if (viewModel.commercialDisplayTechnology === 'LEO') {
    return <LeoSpaceCoverageBlock card={card} viewModel={viewModel} />;
  }
  return <GeoSpaceCoverageBlock card={card} viewModel={viewModel} />;
}

// ─── Step 3: Service Delivery ─────────────────────────────────────────────────

function DestinationReceiveDiagram({ isGateway, endpointLabel }: { isGateway: boolean; endpointLabel: string }) {
  return (
    <div className="relative h-24 overflow-hidden rounded-lg border border-emerald-300/22 bg-[radial-gradient(circle_at_74%_50%,rgba(52,211,153,0.22),transparent_28%),linear-gradient(180deg,rgba(6,78,59,0.24),rgba(15,23,42,0.26))]" aria-hidden="true">
      <div className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-teal-100/10 via-emerald-100/54 to-transparent" />
      <div className="absolute left-[4.7rem] top-[2.85rem] h-2 w-2 rounded-full bg-emerald-100 shadow-[0_0_14px_rgba(167,243,208,0.85)] destination-receive-dot" />
      <div className="absolute left-7 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-teal-200/24 bg-teal-300/10 text-teal-100">
        <Satellite className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="absolute right-7 top-5 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200/35 bg-emerald-300/12 text-emerald-50 destination-receive-pulse">
        {isGateway ? <RadioTower className="h-6 w-6" aria-hidden="true" /> : <SatelliteDish className="h-6 w-6" aria-hidden="true" />}
      </div>
      <div className="absolute bottom-3 left-7 text-[9px] font-bold uppercase tracking-[0.14em] text-teal-100/70">Satellite</div>
      <div className="absolute bottom-3 right-7 text-right text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-100/75">
        {isGateway ? 'Traffic Gateway' : endpointLabel}
      </div>
    </div>
  );
}

function ServiceDeliveryBlock({
  card,
  viewModel,
  commercialRouteModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
  commercialRouteModel?: CommercialRouteModel;
}) {
  const isGateway = viewModel.display.destinationEndpointKind === 'geo_gateway';
  const siteAName = cleanVal(viewModel.siteA?.name) ?? 'Your location';
  const siteBName = cleanVal(viewModel.siteB?.name) ?? cleanVal(viewModel.display.destinationLocation) ?? (isGateway ? 'Traffic Gateway' : 'Destination');
  const receivingSide = cleanVal(viewModel.display.destinationReceivingSide) ?? (isGateway ? 'Traffic Gateway' : 'Destination');
  const isReady = card.statusTone === 'good';

  // Build end-to-end path nodes
  const accessSegment = viewModel.routeSegments.find((s) => s.type === 'access');
  const satelliteSegment = viewModel.routeSegments.find((s) => s.type === 'satellite');
  const destinationSegment = viewModel.routeSegments.find((s) => s.type === 'destination');

  const toNodeStatus = (segment: typeof accessSegment, fallback: typeof isReady): import('./CommercialVisuals').PathNodeStatus => {
    if (!segment) return fallback ? 'confirmed' : 'pending';
    if (segment.status === 'blocked') return 'unavailable';
    if (segment.status === 'warning') return 'at_risk';
    if (segment.isRouteParticipant) return 'confirmed';
    if (segment.status === 'unknown') return 'pending';
    return 'confirmed';
  };

  const satelliteName = cleanVal(viewModel.display.satelliteName)
    ?? (viewModel.commercialDisplayTechnology === 'LEO' ? 'LEO SAT' : 'GEO SAT');

  const pathNodes: PathNode[] = [
    { label: siteAName, statusLabel: accessSegment?.isRouteParticipant ? 'Ready' : 'Pending', status: toNodeStatus(accessSegment, isReady) },
    { label: satelliteName, statusLabel: satelliteSegment?.isRouteParticipant ? 'Active' : 'Pending', status: toNodeStatus(satelliteSegment, isReady) },
    { label: 'Network', statusLabel: isReady ? 'Active' : 'Pending', status: isReady ? 'active' : 'pending' },
    { label: siteBName, statusLabel: destinationSegment?.isRouteParticipant ? 'Confirmed' : 'Pending', status: toNodeStatus(destinationSegment, isReady) },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-300/30 bg-[linear-gradient(180deg,rgba(6,78,59,0.34),rgba(15,23,42,0.44))] p-3.5 shadow-[0_0_46px_rgba(16,185,129,0.11),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <DestinationReceiveDiagram isGateway={isGateway} endpointLabel={receivingSide} />
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-emerald-100/18 to-transparent" />
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">
            {isGateway ? 'Satellite to Traffic Gateway' : `Satellite to ${receivingSide}`}
          </div>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] leading-none ${statusBadgeClass[card.statusTone]}`}>
            {card.statusLabel}
          </span>
        </div>
      </div>

      {/* End-to-end path diagram */}
      <section>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-200/65">End-to-end path</div>
        <EndToEndPathDiagram nodes={pathNodes} />
      </section>

      {/* Delivery confirmation */}
      <section>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-200/65">Delivery confirmation</div>
        <div className="space-y-1.5">
          <FactRow label="Destination" value={siteBName} />
          <FactRow label="Receive type" value={isGateway ? 'Traffic gateway' : 'Customer terminal'} />
          <FactRow label="Signal" value={isReady ? 'Confirmed' : 'Pending'} tone={isReady ? 'good' : 'neutral'} />
          <FactRow label="End-to-end path" value={isReady ? 'Verified' : 'Pending'} tone={isReady ? 'good' : 'neutral'} />
        </div>
      </section>
    </div>
  );
}

// ─── Step 4: Recommendation ───────────────────────────────────────────────────

function VerdictHeroCard({
  viewModel,
  card,
}: {
  viewModel: CommercialScenarioViewModel;
  card: CommercialNarrativeCardModel;
}) {
  const isGeo = viewModel.commercialDisplayTechnology === 'GEO';
  const isLeo = viewModel.commercialDisplayTechnology === 'LEO';

  const heroBorder = isGeo
    ? 'border-blue-200/20 bg-[radial-gradient(circle_at_82%_14%,rgba(96,165,250,0.18),transparent_34%),linear-gradient(180deg,rgba(12,18,46,0.98),rgba(15,23,42,0.96)_66%,rgba(14,30,88,0.90))]'
    : isLeo
    ? 'border-fuchsia-200/18 bg-[radial-gradient(circle_at_82%_14%,rgba(217,70,239,0.18),transparent_34%),linear-gradient(180deg,rgba(18,10,40,0.98),rgba(15,23,42,0.96)_66%,rgba(50,15,90,0.90))]'
    : 'border-slate-500/22 bg-[linear-gradient(180deg,rgba(12,16,30,0.98),rgba(15,23,42,0.96))]';

  const accentText = isGeo ? 'text-blue-300/68' : isLeo ? 'text-fuchsia-300/68' : 'text-slate-400/68';
  const statusLabel = commServiceStatusLabel[viewModel.serviceStatus];
  const statusChipClass = card.statusTone === 'good'
    ? 'border-emerald-400/38 bg-emerald-500/12 text-emerald-200'
    : card.statusTone === 'warning'
    ? 'border-amber-400/38 bg-amber-500/12 text-amber-200'
    : card.statusTone === 'danger'
    ? 'border-rose-400/38 bg-rose-500/12 text-rose-200'
    : 'border-slate-500/38 bg-slate-700/22 text-slate-300';

  const technologyName = isGeo ? 'GEO Satellite' : isLeo ? 'LEO Satellite' : 'Satellite';

  return (
    <div className={`rounded-xl border p-4 shadow-[0_0_60px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.08)] ${heroBorder}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[9px] font-bold uppercase tracking-[0.24em] ${accentText}`}>
            Recommended solution
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <Star className={`h-4 w-4 shrink-0 ${isGeo ? 'text-blue-300' : isLeo ? 'text-fuchsia-300' : 'text-slate-400'}`} aria-hidden="true" />
            <span className="text-[16px] font-bold text-white/90">{technologyName}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${statusChipClass}`}>
          {statusLabel}
        </span>
      </div>
      <p className="mt-3 text-[13px] font-semibold leading-[1.55] text-white/76">
        {viewModel.executiveSummary.expectedExperience || card.narrativeStatement}
      </p>
    </div>
  );
}

function AlternativeCard({ viewModel }: { viewModel: CommercialScenarioViewModel }) {
  const recommended = viewModel.recommendation.technology;
  if (recommended !== 'leo' && recommended !== 'geo') return null;
  const alt = viewModel.comparison.options.find((o) => o.technology !== recommended);
  if (!alt) return null;

  const differentiator = alt.technology === 'geo'
    ? 'Suitable for broadcast, VSAT backup and data-only workloads'
    : 'Lower response time alternative for interactive applications';

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Alternative option</div>
      <div className="mt-1.5 flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-slate-200">{alt.label} Satellite</div>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{differentiator}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold ${alt.available ? 'text-slate-400' : 'text-slate-600'}`}>
          {alt.available ? commServiceStatusLabel[alt.status] : 'Unavailable'}
        </span>
      </div>
      {alt.available && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <CommercialKpiTile value={formatMbps(alt.downloadMbps)} label="Download" />
          <CommercialKpiTile value={formatMs(alt.rttMs)} label="Response" />
          <CommercialKpiTile value={formatMbps(alt.uploadMbps)} label="Upload" />
        </div>
      )}
    </div>
  );
}

function RecommendationBlock({
  viewModel,
  card,
}: {
  viewModel: CommercialScenarioViewModel;
  card: CommercialNarrativeCardModel;
}) {
  const isGeo = viewModel.commercialDisplayTechnology === 'GEO';
  const isLeo = viewModel.commercialDisplayTechnology === 'LEO';
  const selectedOption = viewModel.comparison.options.find(
    (opt) => opt.technology === viewModel.commercialDisplayTechnology.toLowerCase(),
  );
  const dlTier = downloadSpeedTier(selectedOption?.downloadMbps);
  const ulTier = uploadSpeedTier(selectedOption?.uploadMbps);
  const rttTier = responseTimeTier(selectedOption?.rttMs);
  const relTier = reliabilityTier(viewModel.availabilityPct);
  const confidence = confidenceLevelFromPrediction(
    viewModel.display.predictionConfidence?.level ?? viewModel.display.confidence,
  );

  return (
    <div className="space-y-4">
      <VerdictHeroCard viewModel={viewModel} card={card} />

      {/* Architecture diagram — kept from original design */}
      {isGeo && <GeoArchitectureDiagram />}
      {isLeo && <LeoArchitectureDiagram />}

      {/* 4 KPI tiles */}
      <section>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Expected service</div>
        <div className="grid grid-cols-2 gap-1.5">
          <CommercialKpiTile
            value={formatMbps(selectedOption?.downloadMbps ?? viewModel.downloadMbps)}
            label="Download speed"
            sublabel={dlTier.label !== '--' ? dlTier.label : undefined}
            sublabelTone={dlTier.tone}
          />
          <CommercialKpiTile
            value={formatMbps(selectedOption?.uploadMbps ?? viewModel.uploadMbps)}
            label="Upload speed"
            sublabel={ulTier.label !== '--' ? ulTier.label : undefined}
            sublabelTone={ulTier.tone}
          />
          <CommercialKpiTile
            value={formatMs(selectedOption?.rttMs ?? viewModel.rttMs)}
            label="Response time"
            sublabel={rttTier.label !== '--' ? rttTier.label : undefined}
            sublabelTone={rttTier.tone}
          />
          <CommercialKpiTile
            value={viewModel.availabilityPct != null ? `${viewModel.availabilityPct.toFixed(1)}%` : '--'}
            label="Reliability"
            sublabel={relTier.label !== '--' ? relTier.label : undefined}
            sublabelTone={relTier.tone}
          />
        </div>
      </section>

      {/* Use case fit */}
      <section>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Application compatibility</div>
        <UseCaseFitGrid
          rttMs={selectedOption?.rttMs ?? viewModel.rttMs}
          downloadMbps={selectedOption?.downloadMbps ?? viewModel.downloadMbps}
          uploadMbps={selectedOption?.uploadMbps ?? viewModel.uploadMbps}
          serviceStatus={viewModel.serviceStatus}
        />
      </section>

      {/* Alternative option */}
      <AlternativeCard viewModel={viewModel} />

      {/* Forecast confidence */}
      <section>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Forecast confidence</div>
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-3">
          <ForecastConfidenceGauge level={confidence} />
        </div>
      </section>
    </div>
  );
}

// ─── Panel shell ──────────────────────────────────────────────────────────────

function CommercialNarrativePanel({
  viewModel,
  selectedSegmentId,
  commercialRouteModel,
  isOpen,
  onClose,
  onViewFullAnalysis,
}: CommercialNarrativePanelProps) {
  const card = buildCommercialNarrativeCardModel({
    viewModel,
    commercialRouteModel,
    selectedSegmentId,
  });

  const currentIndex = SEGMENT_ORDER.indexOf(toSegmentId(selectedSegmentId));
  const prevId = currentIndex > 0 ? SEGMENT_ORDER[currentIndex - 1] : null;
  const nextId = currentIndex < SEGMENT_ORDER.length - 1 ? SEGMENT_ORDER[currentIndex + 1] : null;
  const isSummary = card.segmentId === 'summary';
  const isAccess = card.segmentId === 'access';
  const isSatellite = card.segmentId === 'satellite';
  const isDestination = card.segmentId === 'destination';
  const panelStatusBadgeClass = isAccess
    ? accessStatusBadgeClass[card.statusTone]
    : isSatellite
      ? 'border-blue-200/60 bg-indigo-400/16 text-blue-50 shadow-[0_0_18px_rgba(96,165,250,0.16)]'
      : isDestination
        ? 'border-emerald-200/60 bg-emerald-400/16 text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.14)]'
        : statusBadgeClass[card.statusTone];

  return (
    <div
      data-site-tooltip-occluder="true"
      className={[
        'commercial-narrative-panel',
        'absolute right-0 top-0 z-40 w-[380px]',
        'bottom-[5.75rem]',
        'transition-transform',
        'duration-200',
        isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none',
      ].join(' ')}
      style={{
        transitionTimingFunction: isOpen
          ? 'cubic-bezier(0.16,1,0.3,1)'
          : 'cubic-bezier(0.4,0,1,1)',
      }}
      aria-hidden={!isOpen}
    >
      {/* Shadow cast on globe behind the panel */}
      <div
        className="commercial-narrative-panel__globe-shadow pointer-events-none absolute inset-y-0 left-0 w-10 -translate-x-full"
        style={{ background: 'linear-gradient(to right, transparent, rgba(6,10,22,0.35))' }}
      />

      {/* Panel body */}
      <div
        className={[
          'commercial-narrative-panel__body',
          'flex h-full flex-col border-l backdrop-blur-2xl',
          isAccess
            ? 'border-cyan-300/18 bg-[linear-gradient(180deg,rgba(4,15,28,0.97),rgba(6,10,22,0.96)_42%,rgba(8,47,73,0.82))]'
            : isSatellite
              ? 'border-indigo-300/18 bg-[linear-gradient(180deg,rgba(7,11,31,0.98),rgba(15,23,42,0.96)_44%,rgba(30,27,75,0.82))]'
              : isDestination
                ? 'border-emerald-300/18 bg-[linear-gradient(180deg,rgba(4,20,18,0.98),rgba(6,16,22,0.96)_44%,rgba(6,78,59,0.78))]'
                : 'border-[rgba(148,163,184,0.10)] bg-[rgba(6,10,22,0.96)]',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 pb-0 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="commercial-narrative-panel__eyebrow inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 shadow-[0_18px_60px_-45px_rgba(15,23,42,0.85)]">
              <span
                className={[
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                  isAccess
                    ? 'border-cyan-200/45 bg-cyan-300/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.18)]'
                    : isSatellite
                      ? 'border-blue-200/45 bg-indigo-300/12 text-blue-100 shadow-[0_0_18px_rgba(96,165,250,0.18)]'
                      : isDestination
                        ? 'border-emerald-200/45 bg-emerald-300/12 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.16)]'
                        : 'border-sky-300/25 bg-sky-300/10 text-sky-300',
                ].join(' ')}
              >
                {segmentIcon[card.segmentId]}
              </span>
              <span className={`text-sm font-semibold uppercase tracking-[0.12em] ${isAccess ? 'text-cyan-100' : isSatellite ? 'text-indigo-100' : isDestination ? 'text-emerald-100' : 'text-slate-100'}`}>
                {card.eyebrow}
              </span>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {!isSummary && (
            <>
              {card.title !== card.eyebrow && (
                <h2 className="commercial-narrative-panel__title mt-3 text-[20px] font-bold leading-tight tracking-tight text-white">
                  {card.title}
                </h2>
              )}
              <span className={`mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${panelStatusBadgeClass}`}>
                {card.statusLabel}
              </span>
            </>
          )}
        </div>

        <div className={`commercial-narrative-panel__divider ${isSummary ? 'mt-3' : 'mt-4'} mx-5 flex-shrink-0 border-t border-[rgba(30,41,59,0.80)]`} />

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isAccess ? (
            <OriginSiteBlock card={card} viewModel={viewModel} />
          ) : isSatellite ? (
            <SpaceCoverageBlock card={card} viewModel={viewModel} />
          ) : isDestination ? (
            <ServiceDeliveryBlock card={card} viewModel={viewModel} commercialRouteModel={commercialRouteModel} />
          ) : isSummary ? (
            <RecommendationBlock viewModel={viewModel} card={card} />
          ) : (
            <>
              <p className="text-[16px] font-medium leading-[1.65] tracking-[-0.01em] text-white">
                {card.narrativeStatement}
              </p>
              {card.facts.length > 0 && (
                <>
                  <div className="mt-5 border-t border-[rgba(30,41,59,0.80)]" />
                  <div className="mt-4 space-y-1.5">
                    {card.facts.map((fact) => (
                      <FactRow key={`${fact.label}:${fact.value}`} label={fact.label} value={fact.value} />
                    ))}
                  </div>
                </>
              )}
              <div className={`mt-5 rounded-lg border p-3 ${noteClass[card.statusTone]}`}>
                <div className="flex items-start gap-2">
                  <NoteIcon tone={card.statusTone} />
                  <p className="text-[13px] font-semibold leading-[1.5]">{card.businessNote}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Prev / Next navigation */}
        {(prevId || nextId) && (
          <div className="flex-shrink-0 border-t border-slate-800/60 px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              {prevId ? (
                <button
                  type="button"
                  onClick={() => onClose?.()}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-200"
                  aria-label="Previous step"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="capitalize">{prevId.replace('destination', 'Service Delivery').replace('satellite', 'Space Coverage').replace('access', 'Origin Site').replace('summary', 'Recommendation')}</span>
                </button>
              ) : <span />}
              {nextId ? (
                <button
                  type="button"
                  onClick={() => onClose?.()}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-200"
                  aria-label="Next step"
                >
                  <span className="capitalize">{nextId.replace('destination', 'Service Delivery').replace('satellite', 'Space Coverage').replace('access', 'Origin Site').replace('summary', 'Recommendation')}</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : <span />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(CommercialNarrativePanel);
