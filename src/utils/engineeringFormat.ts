export interface PredictionConfidenceSummary {
  label?: string;
  score?: number;
  detail?: string;
  display?: string;
}

export const fmtDb = (v: number | undefined | null, d = 1): string =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(d)} dB` : '--';

export const fmtMbps = (v: number | undefined | null): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toFixed(0)} Mbps`;
};

export const fmtMs = (v: number | undefined | null, d = 1): string =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(d)} ms` : '--';

export const fmtPct = (v: number | undefined | null, d = 1): string | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(d)}%` : undefined;

export const fmtThroughputLoss = (
  input: number | undefined | null,
  output: number | undefined | null,
): string | undefined => {
  if (typeof input !== 'number' || typeof output !== 'number' || !Number.isFinite(input) || !Number.isFinite(output)) return undefined;
  const loss = input - output;
  if (loss <= 0.5) return 'no loss';
  return `-${fmtMbps(loss)}`;
};

export const parsePct = (label?: string): number | null => {
  const match = label?.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return match ? Number(match[1]) : null;
};

export const parseConfidence = (label?: string, detail?: string): PredictionConfidenceSummary | undefined => {
  if (!label && !detail) return undefined;
  const score = label?.match(/([0-9]+)\s*\/\s*100/);
  const text = label?.replace(/\s*[0-9]+\s*\/\s*100\s*$/, '').trim();
  return {
    label: text || label,
    score: score ? Number(score[1]) : undefined,
    detail,
    display: label,
  };
};
