import type { LinkMode } from '../../types/linkMode';
import type { SatelliteData } from '../../types/satellites';
import type { LinkSegment } from '../../utils/geoDualSegmentBudget';
import type { GeoRfContext, GeoRfTopology, PublicFrequencyMatch } from '../../types/geoRfContext';

const topologyFromLinkMode = (linkMode?: LinkMode): GeoRfTopology => {
  if (linkMode === 'STAR_FORWARD') return 'FORWARD';
  if (linkMode === 'STAR_RETURN') return 'RETURN';
  if (linkMode === 'MESH') return 'MESH';
  if (linkMode === 'POINT_TO_POINT') return 'POINT_TO_POINT';
  return 'UNKNOWN';
};

const normalizeBand = (band?: string): GeoRfContext['band'] => {
  if (band === 'C') return 'C';
  if (band === 'Ku') return 'KU';
  if (band === 'Ka') return 'KA';
  return 'UNKNOWN';
};

const mhzFromGhz = (value?: number): number | undefined => (
  value === undefined || !Number.isFinite(value) ? undefined : Number((value * 1000).toFixed(3))
);

const coverageRole = (segment?: LinkSegment): 'UPLINK' | 'DOWNLINK' | 'UNKNOWN' => {
  if (!segment) return 'UNKNOWN';
  return segment.candidate.isUplink ? 'UPLINK' : 'DOWNLINK';
};

export interface BuildGeoRfContextInput {
  satellite?: SatelliteData | null;
  linkMode?: LinkMode;
  uplink?: LinkSegment;
  downlink?: LinkSegment;
  coverageLabels?: {
    uplink?: string;
    downlink?: string;
  };
  publicFrequencyMatch?: PublicFrequencyMatch;
}

export const createUnknownGeoRfContext = (
  satellite?: SatelliteData | null,
  warning = 'RF context could not be fully resolved from the current link budget.',
): GeoRfContext => ({
  satelliteId: satellite?.noradId ?? satellite?.id ?? 'UNKNOWN',
  satelliteName: satellite?.name ?? 'Unknown GEO satellite',
  topology: 'UNKNOWN',
  band: 'UNKNOWN',
  uplink: {
    source: 'UNKNOWN',
    confidence: 'UNKNOWN',
    warnings: [warning],
  },
  downlink: {
    source: 'UNKNOWN',
    confidence: 'UNKNOWN',
    warnings: [warning],
  },
  payload: {
    selectedCoverageRole: 'UNKNOWN',
  },
  provenance: {
    rfParametersSource: ['Unknown RF context'],
    notes: ['RF context is explanatory only; it does not change link budget calculations.'],
  },
});

export const buildGeoRfContext = ({
  satellite,
  linkMode,
  uplink,
  downlink,
  coverageLabels,
  publicFrequencyMatch,
}: BuildGeoRfContextInput): GeoRfContext => {
  if (!uplink || !downlink) return createUnknownGeoRfContext(satellite);

  const uplinkCandidate = uplink.candidate;
  const downlinkCandidate = downlink.candidate;
  const band = normalizeBand(downlinkCandidate.band ?? uplinkCandidate.band);
  const selectedCoverageName = coverageLabels?.downlink ?? coverageLabels?.uplink ?? downlinkCandidate.coverageName ?? uplinkCandidate.coverageName;
  const selectedCandidate = publicFrequencyMatch?.selectedCandidateId
    ? publicFrequencyMatch.candidates?.find((candidate) => candidate.transponder.id === publicFrequencyMatch.selectedCandidateId)
    : undefined;

  const uplinkWarnings = [
    ...(uplinkCandidate.isSynthesized ? ['Uplink RF parameters use a synthesized coverage candidate.'] : []),
  ];
  const downlinkWarnings = [
    ...(downlinkCandidate.isSynthesized ? ['Downlink RF parameters use a synthesized coverage candidate.'] : []),
  ];

  if (selectedCandidate?.transponder.uplink.source === 'INFERRED') {
    uplinkWarnings.push('Public uplink frequency is inferred from band rules.');
  }

  return {
    satelliteId: satellite?.noradId ?? uplinkCandidate.satelliteId ?? downlinkCandidate.satelliteId,
    satelliteName: satellite?.name ?? uplinkCandidate.satelliteName ?? downlinkCandidate.satelliteName,
    topology: topologyFromLinkMode(linkMode),
    band,
    uplink: {
      frequencyGHz: uplinkCandidate.frequencyGhz,
      frequencyMHz: mhzFromGhz(uplinkCandidate.frequencyGhz),
      bandwidthMHz: uplinkCandidate.bandwidthMhz,
      beamName: uplinkCandidate.beamName,
      coverageName: coverageLabels?.uplink ?? uplinkCandidate.coverageName,
      source: uplinkCandidate.isSynthesized ? 'INFERRED' : 'SELECTED_COVERAGE',
      confidence: uplinkCandidate.isSynthesized ? 'LOW' : 'HIGH',
      warnings: uplinkWarnings,
    },
    downlink: {
      frequencyGHz: downlinkCandidate.frequencyGhz,
      frequencyMHz: mhzFromGhz(downlinkCandidate.frequencyGhz),
      bandwidthMHz: downlinkCandidate.bandwidthMhz,
      beamName: downlinkCandidate.beamName,
      coverageName: coverageLabels?.downlink ?? downlinkCandidate.coverageName,
      source: downlinkCandidate.isSynthesized ? 'INFERRED' : 'SELECTED_COVERAGE',
      confidence: downlinkCandidate.isSynthesized ? 'LOW' : 'HIGH',
      warnings: downlinkWarnings,
    },
    payload: {
      selectedCoverageName,
      selectedCoverageRole: coverageRole(downlinkCandidate.isSynthesized ? uplink : downlink),
      selectedTransponderName: selectedCandidate?.transponder.transponder.publicName,
      selectedTransponderNumber: selectedCandidate?.transponder.transponder.publicNumber,
      matchedPublicTransponderId: selectedCandidate?.transponder.id,
      matchedPublicObservationCount: selectedCandidate?.transponder.groupedObservationCount,
    },
    publicFrequencyMatch,
    provenance: {
      rfParametersSource: [
        'GEO link budget segment inputs',
        uplinkCandidate.isSynthesized || downlinkCandidate.isSynthesized ? 'Synthesized missing-direction coverage fallback' : 'Selected coverage',
      ],
      publicDataSource: publicFrequencyMatch?.source === 'LYNGSAT_NORMALIZED'
        ? 'LyngSat-derived normalized public data'
        : undefined,
      notes: [
        'RF context explains the link budget inputs; it does not override calculation values.',
        'Public frequency data is not operational data.',
      ],
    },
  };
};

export const applyPublicFrequencyMatchToContext = (
  context: GeoRfContext,
  publicFrequencyMatch: PublicFrequencyMatch,
): GeoRfContext => {
  const selectedCandidate = publicFrequencyMatch.selectedCandidateId
    ? publicFrequencyMatch.candidates?.find((candidate) => candidate.transponder.id === publicFrequencyMatch.selectedCandidateId)
    : undefined;

  return {
    ...context,
    publicFrequencyMatch,
    payload: {
      ...context.payload,
      selectedTransponderName: selectedCandidate?.transponder.transponder.publicName,
      selectedTransponderNumber: selectedCandidate?.transponder.transponder.publicNumber,
      matchedPublicTransponderId: selectedCandidate?.transponder.id,
      matchedPublicObservationCount: selectedCandidate?.transponder.groupedObservationCount,
    },
    uplink: {
      ...context.uplink,
      warnings: Array.from(new Set([
        ...context.uplink.warnings,
        ...(selectedCandidate?.transponder.uplink.source === 'INFERRED'
          ? ['Public uplink frequency is inferred from band rules.']
          : []),
      ])),
    },
    provenance: {
      ...context.provenance,
      publicDataSource: publicFrequencyMatch.source === 'LYNGSAT_NORMALIZED'
        ? 'LyngSat-derived normalized public data'
        : context.provenance.publicDataSource,
    },
  };
};
