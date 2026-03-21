import type { LeoConnectivityViewModel } from './leoServiceViewModel';

export type SelectedPointScope = 'LEO' | 'GEO' | 'ALL';

export type GeoPointStatus =
  | 'available'
  | 'out_of_coverage'
  | 'unstable'
  | 'gateway_unavailable'
  | 'unknown';

export type SelectedPointStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface SelectedPointStatusLine {
  text: string;
  tone: SelectedPointStatusTone;
}

export interface SelectedPointStatusPresentation {
  lines: SelectedPointStatusLine[];
  tone: SelectedPointStatusTone;
}

function getLeoStatusLine(
  viewModel?: LeoConnectivityViewModel | null
): SelectedPointStatusLine {
  if (!viewModel) {
    return { text: 'LEO: unknown', tone: 'neutral' };
  }

  if (viewModel.finalServiceStatus === 'ALLOWED') {
    return { text: 'LEO: available', tone: 'success' };
  }

  if (viewModel.decisionDriver === 'RF' && viewModel.finalServiceStatus === 'BLOCKED') {
    return { text: 'LEO: RF unavailable', tone: 'danger' };
  }

  if (viewModel.decisionDriver === 'REGULATORY' && viewModel.finalServiceStatus === 'BLOCKED') {
    return { text: 'LEO: regulatory block', tone: 'danger' };
  }

  if (viewModel.decisionDriver === 'NETWORK') {
    return { text: 'LEO: gateway unavailable', tone: 'warning' };
  }

  if (viewModel.decisionDriver === 'CAPACITY') {
    return { text: 'LEO: capacity constrained', tone: 'warning' };
  }

  if (viewModel.finalServiceStatus === 'DEGRADED') {
    return { text: 'LEO: degraded', tone: 'warning' };
  }

  return { text: 'LEO: unknown', tone: 'neutral' };
}

function getGeoStatusLine(status?: GeoPointStatus | null): SelectedPointStatusLine {
  if (status === 'available') {
    return { text: 'GEO: available', tone: 'success' };
  }
  if (status === 'unstable') {
    return { text: 'GEO: unstable', tone: 'warning' };
  }
  if (status === 'gateway_unavailable') {
    return { text: 'GEO: gateway unavailable', tone: 'danger' };
  }
  if (status === 'out_of_coverage') {
    return { text: 'GEO: out of coverage', tone: 'danger' };
  }
  return { text: 'GEO: unknown', tone: 'neutral' };
}

function combineTones(lines: SelectedPointStatusLine[]): SelectedPointStatusTone {
  if (lines.some((line) => line.tone === 'success')) return 'success';
  if (lines.some((line) => line.tone === 'warning')) return 'warning';
  if (lines.every((line) => line.tone === 'neutral')) return 'neutral';
  return 'danger';
}

export function deriveSelectedPointStatusPresentation(args: {
  scope: SelectedPointScope;
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  geoStatus?: GeoPointStatus | null;
}): SelectedPointStatusPresentation {
  const { scope, leoServiceViewModel, geoStatus } = args;

  if (scope === 'LEO') {
    const line = getLeoStatusLine(leoServiceViewModel);
    return { lines: [line], tone: line.tone };
  }

  if (scope === 'GEO') {
    const line = getGeoStatusLine(geoStatus);
    return { lines: [line], tone: line.tone };
  }

  const lines = [
    getLeoStatusLine(leoServiceViewModel),
    getGeoStatusLine(geoStatus),
  ];

  return {
    lines,
    tone: combineTones(lines),
  };
}
