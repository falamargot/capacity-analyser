import type { SatelliteData } from '../types/satellites';

export type GeoCapacityClassId =
  | 'LEGACY_WIDEBEAM_GEO'
  | 'REGIONAL_KU_GEO'
  | 'HTS_GEO'
  | 'VHTS_GEO';

export interface GeoCapacityClassDescriptor {
  id: GeoCapacityClassId;
  label: string;
  nominalGbps: number;
  rangeGbps: [number, number];
  confidence: 'High' | 'Medium' | 'Low';
  provenance: string;
  assumptions: string[];
}

export interface GeoCapacityEstimate extends GeoCapacityClassDescriptor {
  satelliteId: string;
  satelliteName: string;
  classificationReason: string;
}

export const GEO_CAPACITY_CLASSES: Record<GeoCapacityClassId, GeoCapacityClassDescriptor> = {
  LEGACY_WIDEBEAM_GEO: {
    id: 'LEGACY_WIDEBEAM_GEO',
    label: 'Legacy widebeam GEO',
    nominalGbps: 4,
    rangeGbps: [2, 8],
    confidence: 'Medium',
    provenance: 'Public GEO payload class approximation for conventional widebeam C/Ku transponder payloads.',
    assumptions: [
      'Capacity represents a feasibility-level payload class, not a live fill-rate or leased capacity value.',
      'Widebeam payloads are treated as lower aggregate-throughput systems than HTS spot-beam payloads.',
    ],
  },
  REGIONAL_KU_GEO: {
    id: 'REGIONAL_KU_GEO',
    label: 'Regional Ku-band GEO',
    nominalGbps: 12,
    rangeGbps: [8, 20],
    confidence: 'Medium',
    provenance: 'Public regional Ku-band GEO payload class approximation.',
    assumptions: [
      'Regional Ku payloads are modeled above legacy widebeam satellites but below dedicated HTS payloads.',
      'The value is suitable for architecture comparison only; it is not a transponder loading plan.',
    ],
  },
  HTS_GEO: {
    id: 'HTS_GEO',
    label: 'HTS GEO',
    nominalGbps: 90,
    rangeGbps: [50, 150],
    confidence: 'Medium',
    provenance: 'Public HTS/spot-beam GEO payload class approximation, including Ka-band broadband payload families.',
    assumptions: [
      'Spot-beam frequency reuse is represented through a class-level aggregate capacity band.',
      'No claim is made about usable capacity at a selected customer point or live payload loading.',
    ],
  },
  VHTS_GEO: {
    id: 'VHTS_GEO',
    label: 'VHTS GEO',
    nominalGbps: 500,
    rangeGbps: [400, 500],
    confidence: 'High',
    provenance: 'Public VHTS payload disclosures; Eutelsat KONNECT VHTS is publicly described as a 500 Gbps-class system.',
    assumptions: [
      'VHTS capacity is treated as satellite aggregate payload class capacity.',
      'Point feasibility still depends on coverage, terminal class, weather and gateway assumptions.',
    ],
  },
};

const normalize = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ');

const includesAny = (haystack: string, needles: string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

export function estimateGeoSatelliteCapacity(satellite: SatelliteData): GeoCapacityEstimate {
  const haystack = normalize([
    satellite.name,
    satellite.id,
    satellite.coverageFileId,
    satellite.capacity?.bandwidth?.ka ? ' KA ' : '',
    satellite.capacity?.bandwidth?.ku ? ' KU ' : '',
    satellite.capacity?.bandwidth?.c ? ' C ' : '',
  ].filter(Boolean).join(' '));

  let descriptor: GeoCapacityClassDescriptor = GEO_CAPACITY_CLASSES.REGIONAL_KU_GEO;
  let classificationReason = 'Default GEO fallback: regional Ku-band class used when public payload class is not encoded.';

  if (includesAny(haystack, ['KONNECT VHTS', 'VHTS'])) {
    descriptor = GEO_CAPACITY_CLASSES.VHTS_GEO;
    classificationReason = 'Satellite name or coverage metadata identifies a VHTS payload class.';
  } else if (includesAny(haystack, ['KONNECT', 'KA SAT', 'KA-SAT', 'HTS', 'QUANTUM', '10B', '172B'])) {
    descriptor = GEO_CAPACITY_CLASSES.HTS_GEO;
    classificationReason = 'Satellite metadata indicates HTS, spot-beam or Ka broadband payload characteristics.';
  } else if (includesAny(haystack, [' C ', 'C BAND', 'WIDEBEAM', 'WIDE BEAM'])) {
    descriptor = GEO_CAPACITY_CLASSES.LEGACY_WIDEBEAM_GEO;
    classificationReason = 'Satellite metadata indicates conventional widebeam or C-band payload characteristics.';
  } else if (includesAny(haystack, ['KU', 'EUTELSAT'])) {
    descriptor = GEO_CAPACITY_CLASSES.REGIONAL_KU_GEO;
    classificationReason = 'Satellite metadata indicates a regional Ku-band GEO payload class.';
  }

  return {
    ...descriptor,
    satelliteId: satellite.id,
    satelliteName: satellite.name,
    classificationReason,
  };
}

export function estimateGeoSatelliteCapacityGbps(satellite: SatelliteData): number {
  return estimateGeoSatelliteCapacity(satellite).nominalGbps;
}
