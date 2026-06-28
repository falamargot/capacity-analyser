import { memo } from 'react';
import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import type { CommercialStatus } from './commercialTypes';

// ─── Qualitative tier helpers ────────────────────────────────────────────────

export function downloadSpeedTier(mbps: number | undefined): { label: string; tone: TileSubTone } {
  if (mbps == null || !Number.isFinite(mbps) || mbps <= 0) return { label: '--', tone: 'neutral' };
  if (mbps >= 200) return { label: 'High-performance', tone: 'excellent' };
  if (mbps >= 50)  return { label: 'Enterprise', tone: 'good' };
  if (mbps >= 5)   return { label: 'Standard', tone: 'good' };
  return { label: 'Basic', tone: 'warning' };
}

export function uploadSpeedTier(mbps: number | undefined): { label: string; tone: TileSubTone } {
  if (mbps == null || !Number.isFinite(mbps) || mbps <= 0) return { label: '--', tone: 'neutral' };
  if (mbps >= 100) return { label: 'High-performance', tone: 'excellent' };
  if (mbps >= 20)  return { label: 'Enterprise', tone: 'good' };
  if (mbps >= 5)   return { label: 'Standard', tone: 'good' };
  return { label: 'Basic', tone: 'warning' };
}

export function responseTimeTier(ms: number | undefined): { label: string; tone: TileSubTone } {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return { label: '--', tone: 'neutral' };
  if (ms < 50)  return { label: 'Real-time', tone: 'excellent' };
  if (ms < 150) return { label: 'Interactive', tone: 'good' };
  if (ms < 400) return { label: 'Standard', tone: 'warning' };
  return { label: 'High-latency', tone: 'poor' };
}

export function reliabilityTier(pct: number | undefined): { label: string; tone: TileSubTone } {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return { label: '--', tone: 'neutral' };
  if (pct >= 99.5) return { label: 'Excellent', tone: 'excellent' };
  if (pct >= 99)   return { label: 'High', tone: 'good' };
  if (pct >= 97)   return { label: 'Standard', tone: 'good' };
  return { label: 'Limited', tone: 'warning' };
}

export function commercialInterpretation(rttMs: number | undefined, serviceStatus: CommercialStatus): string {
  if (serviceStatus === 'blocked') return 'No service is currently available for this route.';
  if (serviceStatus === 'unknown') return 'Awaiting route evidence to confirm service.';
  if (rttMs == null || !Number.isFinite(rttMs) || rttMs <= 0) return 'Service available — performance details pending.';
  if (rttMs < 50)  return 'Suitable for video conferencing, VoIP and real-time applications.';
  if (rttMs < 150) return 'Suitable for cloud applications, remote desktop and interactive use.';
  if (rttMs < 400) return 'Suitable for cloud applications, web browsing and file transfer.';
  return 'Best suited for web browsing, email and non-interactive data transfer.';
}

// ─── CommercialKpiTile ───────────────────────────────────────────────────────

type TileSubTone = 'excellent' | 'good' | 'warning' | 'poor' | 'neutral';

interface CommercialKpiTileProps {
  value: string;
  label: string;
  sublabel?: string;
  sublabelTone?: TileSubTone;
}

const subToneClass: Record<TileSubTone, string> = {
  excellent: 'text-emerald-300',
  good: 'text-emerald-400',
  warning: 'text-amber-400',
  poor: 'text-rose-400',
  neutral: 'text-slate-500',
};

export const CommercialKpiTile = memo(function CommercialKpiTile({
  value,
  label,
  sublabel,
  sublabelTone = 'neutral',
}: CommercialKpiTileProps) {
  return (
    <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-2.5 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1.5 text-[17px] font-black leading-none tabular-nums text-white">{value}</div>
      {sublabel && sublabel !== '--' && (
        <div className={`mt-1 text-[10px] font-bold ${subToneClass[sublabelTone]}`}>{sublabel}</div>
      )}
    </div>
  );
});

// ─── SignalQualityBar ────────────────────────────────────────────────────────

type SignalQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

interface SignalQualityBarProps {
  quality?: SignalQuality;
}

export function qualityFromText(text: string | undefined | null): SignalQuality {
  if (!text) return 'unknown';
  const lower = text.toLowerCase();
  if (lower.includes('excellent') || lower.includes('very good') || lower.includes('strong')) return 'excellent';
  if (lower.includes('good') || lower.includes('high') || lower.includes('confirmed') || lower.includes('active')) return 'good';
  if (lower.includes('fair') || lower.includes('moderate') || lower.includes('medium')) return 'fair';
  if (lower.includes('poor') || lower.includes('low') || lower.includes('weak') || lower.includes('limited')) return 'poor';
  return 'unknown';
}

const qualityLabel: Record<SignalQuality, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unknown: '--',
};

const qualityFilledSegments: Record<SignalQuality, number> = {
  excellent: 5,
  good: 4,
  fair: 3,
  poor: 1,
  unknown: 0,
};

const qualityBarColor: Record<SignalQuality, string> = {
  excellent: 'bg-emerald-400',
  good: 'bg-emerald-400',
  fair: 'bg-amber-400',
  poor: 'bg-rose-400',
  unknown: 'bg-slate-600',
};

export const SignalQualityBar = memo(function SignalQualityBar({ quality = 'unknown' }: SignalQualityBarProps) {
  const filled = qualityFilledSegments[quality];
  const color = qualityBarColor[quality];
  const label = qualityLabel[quality];

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={`h-2 w-4 rounded-sm transition-colors ${i < filled ? color : 'bg-slate-800'}`}
          />
        ))}
      </div>
      <span className="text-[11px] font-semibold text-slate-300">{label}</span>
    </div>
  );
});

// ─── ForecastConfidenceGauge ─────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'moderate' | 'indicative';

interface ForecastConfidenceGaugeProps {
  level: ConfidenceLevel;
}

export function confidenceLevelFromPrediction(level: string | undefined): ConfidenceLevel {
  if (!level) return 'indicative';
  const lower = level.toLowerCase();
  if (lower.includes('high')) return 'high';
  if (lower.includes('medium') || lower.includes('moderate') || lower.includes('mid')) return 'moderate';
  return 'indicative';
}

const confidenceDesc: Record<ConfidenceLevel, string> = {
  high: 'Based on live coverage analysis and current network conditions.',
  moderate: 'Based on partial route evidence with some assumptions applied.',
  indicative: 'Coverage estimated — live confirmation pending.',
};

const confidencePosition: Record<ConfidenceLevel, number> = {
  indicative: 16,
  moderate: 52,
  high: 88,
};

const confidenceBarColor: Record<ConfidenceLevel, string> = {
  high: 'bg-emerald-400',
  moderate: 'bg-amber-400',
  indicative: 'bg-slate-500',
};

const confidenceTextColor: Record<ConfidenceLevel, string> = {
  high: 'text-emerald-300',
  moderate: 'text-amber-300',
  indicative: 'text-slate-400',
};

export const ForecastConfidenceGauge = memo(function ForecastConfidenceGauge({ level }: ForecastConfidenceGaugeProps) {
  const position = confidencePosition[level];
  const barColor = confidenceBarColor[level];
  const textColor = confidenceTextColor[level];

  return (
    <div>
      <div className="relative h-1.5 w-full rounded-full bg-slate-800" aria-hidden="true">
        <div className="absolute inset-0 flex rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-slate-600/30" />
          <div className="h-full w-1/3 bg-amber-500/20" />
          <div className="h-full w-1/3 bg-emerald-500/20" />
        </div>
        <div
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 ${barColor}`}
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.1em] text-slate-600">
        <span>Indicative</span>
        <span>Moderate</span>
        <span>High</span>
      </div>
      <div className="mt-2 flex items-start gap-2">
        <span className={`mt-px text-[11px] font-bold shrink-0 ${textColor}`}>
          {level === 'high' ? 'High' : level === 'moderate' ? 'Moderate' : 'Indicative'}
        </span>
        <span className="text-[11px] leading-4 text-slate-400">{confidenceDesc[level]}</span>
      </div>
    </div>
  );
});

// ─── EndToEndPathDiagram ─────────────────────────────────────────────────────

export type PathNodeStatus = 'ready' | 'active' | 'confirmed' | 'at_risk' | 'unavailable' | 'pending';

export interface PathNode {
  label: string;
  statusLabel: string;
  status: PathNodeStatus;
}

interface EndToEndPathDiagramProps {
  nodes: PathNode[];
}

const nodeStatusDot: Record<PathNodeStatus, string> = {
  ready:       'bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.7)]',
  active:      'bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.7)]',
  confirmed:   'bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.7)]',
  at_risk:     'bg-amber-400 shadow-[0_0_7px_rgba(251,191,36,0.7)]',
  unavailable: 'bg-rose-400 shadow-[0_0_7px_rgba(251,113,133,0.7)]',
  pending:     'bg-slate-500',
};

const nodeStatusTextColor: Record<PathNodeStatus, string> = {
  ready:       'text-emerald-400',
  active:      'text-emerald-400',
  confirmed:   'text-emerald-400',
  at_risk:     'text-amber-400',
  unavailable: 'text-rose-400',
  pending:     'text-slate-500',
};

export const EndToEndPathDiagram = memo(function EndToEndPathDiagram({ nodes }: EndToEndPathDiagramProps) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-3">
      <div className="flex items-start">
        {nodes.map((node, index) => (
          <div key={index} className="flex min-w-0 flex-1 items-start">
            <div className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {index > 0 && (
                  <div className="mt-[0.35rem] flex-1 border-t border-dashed border-slate-700" />
                )}
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${nodeStatusDot[node.status]}`} aria-hidden="true" />
                {index < nodes.length - 1 && (
                  <div className="mt-[0.35rem] flex-1 border-t border-dashed border-slate-700" />
                )}
              </div>
              <div className="mt-2 px-0.5 text-center">
                <div className="text-[10px] font-semibold leading-tight text-white">{node.label}</div>
                <div className={`mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${nodeStatusTextColor[node.status]}`}>
                  {node.statusLabel}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── UseCaseFitGrid ──────────────────────────────────────────────────────────

type FitLevel = 'supported' | 'partial' | 'unsupported';

interface UseCase {
  label: string;
  fit: FitLevel;
}

interface UseCaseFitGridProps {
  rttMs?: number;
  downloadMbps?: number;
  uploadMbps?: number;
  serviceStatus?: CommercialStatus;
}

function computeUseCases(
  rttMs: number | undefined,
  downloadMbps: number | undefined,
  uploadMbps: number | undefined,
  serviceStatus: CommercialStatus | undefined,
): UseCase[] {
  if (serviceStatus === 'blocked') {
    return [
      { label: 'Video conferencing', fit: 'unsupported' },
      { label: 'VoIP / Voice calls', fit: 'unsupported' },
      { label: 'Cloud applications', fit: 'unsupported' },
      { label: 'Web browsing', fit: 'unsupported' },
      { label: 'Email & file transfer', fit: 'unsupported' },
      { label: 'Video streaming', fit: 'unsupported' },
    ];
  }

  const rtt = rttMs ?? 0;
  const dl = downloadMbps ?? 0;
  const ul = uploadMbps ?? 0;
  const hasVideoUpload = ul >= 1.5;
  const hasGoodDownload = dl >= 5;

  if (rtt > 0 && rtt < 50) {
    return [
      { label: 'Video conferencing', fit: hasGoodDownload && hasVideoUpload ? 'supported' : 'partial' },
      { label: 'VoIP / Voice calls', fit: 'supported' },
      { label: 'Remote desktop', fit: 'supported' },
      { label: 'Cloud applications', fit: 'supported' },
      { label: 'Web browsing', fit: 'supported' },
      { label: 'Email & file transfer', fit: 'supported' },
    ];
  }

  if (rtt >= 50 && rtt < 150) {
    return [
      { label: 'Video conferencing', fit: hasVideoUpload ? 'supported' : 'partial' },
      { label: 'VoIP / Voice calls', fit: 'supported' },
      { label: 'Remote desktop', fit: 'supported' },
      { label: 'Cloud applications', fit: 'supported' },
      { label: 'Web browsing', fit: 'supported' },
      { label: 'Email & file transfer', fit: 'supported' },
    ];
  }

  if (rtt >= 150 && rtt < 400) {
    return [
      { label: 'Video conferencing', fit: 'partial' },
      { label: 'VoIP / Voice calls', fit: 'partial' },
      { label: 'Remote desktop', fit: 'partial' },
      { label: 'Cloud applications', fit: 'supported' },
      { label: 'Web browsing', fit: 'supported' },
      { label: 'Email & file transfer', fit: 'supported' },
    ];
  }

  if (rtt >= 400) {
    return [
      { label: 'Video conferencing', fit: 'unsupported' },
      { label: 'VoIP / Voice calls', fit: 'partial' },
      { label: 'Remote desktop', fit: 'unsupported' },
      { label: 'Cloud applications', fit: 'supported' },
      { label: 'Web browsing', fit: 'supported' },
      { label: 'Email & file transfer', fit: 'supported' },
    ];
  }

  return [
    { label: 'Video conferencing', fit: 'partial' },
    { label: 'VoIP / Voice calls', fit: 'partial' },
    { label: 'Cloud applications', fit: 'partial' },
    { label: 'Web browsing', fit: 'partial' },
    { label: 'Email & file transfer', fit: 'partial' },
    { label: 'Remote desktop', fit: 'partial' },
  ];
}

function FitIcon({ fit }: { fit: FitLevel }) {
  if (fit === 'supported') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />;
  if (fit === 'partial') return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />;
  return <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />;
}

export const UseCaseFitGrid = memo(function UseCaseFitGrid({
  rttMs,
  downloadMbps,
  uploadMbps,
  serviceStatus,
}: UseCaseFitGridProps) {
  const cases = computeUseCases(rttMs, downloadMbps, uploadMbps, serviceStatus);

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {cases.map((useCase) => (
        <div
          key={useCase.label}
          className="flex items-center gap-2 rounded-md border border-slate-800/60 bg-slate-900/40 px-2.5 py-2"
        >
          <FitIcon fit={useCase.fit} />
          <span className="text-[11px] font-semibold text-slate-200">{useCase.label}</span>
        </div>
      ))}
    </div>
  );
});
