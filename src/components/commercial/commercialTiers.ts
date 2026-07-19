/**
 * Qualitative tier helpers for the commercial narrative surfaces — map raw
 * KPIs (speed, latency, reliability, confidence) onto customer-facing labels
 * and tones rendered by the CommercialVisuals components.
 */
import type { CommercialStatus } from './commercialTypes';

export type TileSubTone = 'excellent' | 'good' | 'warning' | 'poor' | 'neutral';
export type SignalQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
export type ConfidenceLevel = 'high' | 'moderate' | 'indicative';

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

export function qualityFromText(text: string | undefined | null): SignalQuality {
  if (!text) return 'unknown';
  const lower = text.toLowerCase();
  if (lower.includes('excellent') || lower.includes('very good') || lower.includes('strong')) return 'excellent';
  if (lower.includes('good') || lower.includes('high') || lower.includes('confirmed') || lower.includes('active')) return 'good';
  if (lower.includes('fair') || lower.includes('moderate') || lower.includes('medium')) return 'fair';
  if (lower.includes('poor') || lower.includes('low') || lower.includes('weak') || lower.includes('limited')) return 'poor';
  return 'unknown';
}

export function confidenceLevelFromPrediction(level: string | undefined): ConfidenceLevel {
  if (!level) return 'indicative';
  const lower = level.toLowerCase();
  if (lower.includes('high')) return 'high';
  if (lower.includes('medium') || lower.includes('moderate') || lower.includes('mid')) return 'moderate';
  return 'indicative';
}
