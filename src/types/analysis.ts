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
    name?: string;
    type?: string;
}

export interface CandidateCoverage {
    satelliteId: string;
    satelliteName: string;
    beamId: string;
    beamName: string;
    elevation: number;
    distanceFromBeamCenter: number;
    throughputEstimate: number;
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
