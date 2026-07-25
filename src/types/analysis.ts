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
    | 'unstable'
    /**
     * STAR_FORWARD/STAR_RETURN only: the satellite's resolved SCC site has no
     * CONFIRMED or PUBLICLY_LIKELY traffic role (GeoGatewayData.trafficStatus).
     * Distinct from 'gateway_unavailable', which means no SCC site is
     * geometrically visible at all — this means a site IS visible but its
     * commercial traffic function is not verified, so no link budget should
     * be computed against it.
     */
    | 'teleport_unconfirmed';

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
    /**
     * True when this candidate was synthesised from the opposite direction using
     * nominal satellite parameters (no real contour data available). Synthesised
     * candidates are used for internal link-budget computation only and should
     * not be shown as selectable beams in the coverage picker UI.
     */
    isSynthesized?: boolean;
    /** Explains why a synthesized candidate exists so diagnostics can stay honest. */
    syntheticSource?: 'opposite-direction' | 'estimated-star-feeder';
    /** Conservative RF penalty applied because the source contour data is missing. */
    dataPenaltyDb?: number;
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
    /**
     * Displayed latency in ms — legacy field name, NOT always a round trip.
     * LEO publishes its round-trip estimate; GEO publishes the one-way user
     * latency for the active direction including network overhead (same
     * figure as the ENG headline). UI surfaces must label this "latency",
     * never "RTT".
     */
    rtt: number | null;
    downlinkGbps: number | null;
    uplinkGbps: number | null;
    downlinkEstimated?: boolean;
    uplinkEstimated?: boolean;
}

export interface MeshLinkMetrics {
    forwardMbps: number | null;
    reverseMbps: number | null;
    /** Selected A→B one-way terminal-to-terminal latency, including modem overhead. */
    forwardLatencyMs: number | null;
    /** Selected B→A one-way terminal-to-terminal latency, including modem overhead. */
    reverseLatencyMs: number | null;
    /** Legacy 4-hop diagnostic reference; not used as selected route latency. */
    rttMs: number | null;
    /**
     * #4: true when the direction's throughput is a pure RF estimated ceiling
     * (no GEO modem selected on either endpoint), NOT a modem-limited delivered
     * rate. UIs must not present an estimated ceiling as guaranteed throughput.
     * Absent/false ⇒ at least one endpoint modem constrained the figure.
     */
    forwardEstimatedCeiling?: boolean;
    reverseEstimatedCeiling?: boolean;
}

export interface GeoSiteToSitePathSummary {
    satelliteName: string | null;
    aToB: {
        uplink: {
            beamName: string | null;
            slantRangeKm: number | null;
            latencyMs?: number | null;
        };
        downlink: {
            beamName: string | null;
            slantRangeKm: number | null;
            latencyMs?: number | null;
        };
    };
    bToA?: {
        uplink: {
            beamName: string | null;
            slantRangeKm: number | null;
            latencyMs?: number | null;
        };
        downlink: {
            beamName: string | null;
            slantRangeKm: number | null;
            latencyMs?: number | null;
        };
    } | null;
}

export interface GeoSiteToSiteSegmentSummary {
    uplink: {
        beamName: string | null;
        slantRangeKm: number | null;
        latencyMs?: number | null;
    };
    downlink: {
        beamName: string | null;
        slantRangeKm: number | null;
        latencyMs?: number | null;
    };
}

export interface MobileAnalysisMetrics {
    leo: MobileLinkMetrics | null;
    geo: MobileLinkMetrics | null;
    totalGbps: number;
    coveredCount: number;
    mesh?: MeshLinkMetrics | null;
    geoSiteToSitePath?: GeoSiteToSitePathSummary | null;
}
