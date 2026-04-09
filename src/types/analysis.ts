/**
 * Types for analyzis state and related data structures
 */
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { SatelliteData } from './satellites';
import type { SNPData } from '../components/globe/GlobeConfig';

/**
 * Analyzis position - either from clicking the earth or selecting an aircraft
 */
export interface AnalyzisPosition {
    lat: number;
    lng: number;
    altitude?: number;
    source: 'earth' | 'aircraft';
    aircraftCallsign?: string;
}

/**
 * GEO beam coverage data
 */
export interface GEOBeam {
    feature: any;
    coverageFeatures?: any[];
    name?: string;
    type?: string;
}

export interface SelectionPosition {
    lat: number;
    lng: number;
    altitude?: number;
}

export type Selection =
    | { type: 'none' }
    | { type: 'satellite'; satelliteId: string }
    | { type: 'coverage'; satelliteId: string; coverageId: string }
    | { type: 'contour'; satelliteId: string; coverageId: string; contourId: string }
    | { type: 'target'; targetType: 'point' | 'aircraft' | 'vessel'; position: SelectionPosition };

export interface CandidateCoverageScoreBreakdown {
    elevation: number;
    linkMargin: number;
    throughput: number;
    latency: number;
    total: number;
}

export type CandidateCoverageStatus =
    | 'available'
    | 'gateway_unavailable'
    | 'unstable';

export interface CandidateCoverage {
    satelliteId: string;
    satelliteName: string;
    missionName: string;
    coverageKey: string;
    coverageName: string;
    beamId: string;
    beamName: string;
    elevation: number;
    distanceFromBeamCenter: number;
    /** Estimated achievable throughput from the GEO link budget (Mbps). */
    throughputEstimate: number;
    /** Raw contour RF value: EIRP in dBW (downlink) or G/T in dB/K (uplink). Null for legacy coverage files. */
    level: number | null;
    /** True when this coverage is an uplink (G/T), false for downlink (IPFD). */
    isUplink: boolean;
    eirpDbw?: number;
    gtDbk?: number;
    band?: 'C' | 'Ku' | 'Ka';
    frequencyGhz?: number;
    bandwidthMhz?: number;
    atmosphericLossDb?: number;
    slantRangeKm?: number;
    fsplDb?: number;
    cn0Dbhz?: number;
    cnDb?: number;
    linkMarginDb?: number;
    modcod?: string;
    spectralEfficiency?: number;
    latencyMs: number | null;
    status: CandidateCoverageStatus;
    scoreBreakdown: CandidateCoverageScoreBreakdown;
    score: number;
}

/**
 * Selected SNP (Satellite Network Portal) data
 */
export type SelectedSNP = SNPData | null;

/**
 * Auto-selection state for satellites
 */
export interface AutoSelectionState {
    leoSatelliteId: string | null;
    geoSatelliteId: string | null;
    snp: SelectedSNP;
    geoBeam: GEOBeam | null;
}

export interface MobileLinkMetrics {
    rtt: number;
    downlinkGbps: number;
    uplinkGbps: number;
}

export interface MobileAnalysisMetrics {
    leo: MobileLinkMetrics | null;
    geo: MobileLinkMetrics | null;
    totalGbps: number;
    coveredCount: number;
}
