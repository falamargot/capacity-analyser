/**
 * Types for analysis state and related data structures
 */
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { SatelliteData } from './satellites';
import type { SNPData } from '../components/globe/GlobeConfig';

/**
 * Analysis position - either from clicking the earth or selecting an aircraft
 */
export interface AnalysisPosition {
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
