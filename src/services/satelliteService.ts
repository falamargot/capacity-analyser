import * as satellite from 'satellite.js';
import { SatelliteData } from '../types/satellites';
import { loadSatelliteCoverage } from './coverageService';

const USE_CACHE = true

const CELESTRAK_API = {
  EUTELSAT: 'https://celestrak.org/NORAD/elements/gp.php?NAME=EUTELSAT&FORMAT=tle',
  ONEWEB: 'https://celestrak.org/NORAD/elements/gp.php?NAME=ONEWEB&FORMAT=tle'
};

const CELESTRAK_FILE = {
  EUTELSAT: '/celestrak.txt',
  ONEWEB: '/celestrak.txt'
};

export interface SatRecSatellite {
  satrec: any;
  name: string;
  noradId: string;
}

function parseTLE(tleData: string, operator: string) {
  const lines = tleData.split('\n').filter(line => line.trim());
  const satellites = [];

  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 >= lines.length) break;

    const name = lines[i].trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    const satrec = satellite.twoline2satrec(line1, line2);
    if (satrec && name.includes(operator)) {
      satellites.push({
        name,
        satrec,
        noradId: line1.substring(2, 7).trim()
      });
    }
  }
  return satellites;
}

export function calculatePosition(sat: any, date: Date = new Date()) {
  const positionAndVelocity = satellite.propagate(sat.satrec, date);
  const gmst = satellite.gstime(date);

  if (positionAndVelocity && positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
    const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    return {
      lat: satellite.degreesLat(geoPosition.latitude),
      lng: satellite.degreesLong(geoPosition.longitude),
      alt: geoPosition.height
    };
  }

  return { lat: 0, lng: 0, alt: 0 };
}

export async function fetchSatellites(): Promise<SatelliteData[]> {
  try {
    const [eutelsatResponse, onewebResponse] = await Promise.all([
      fetch(USE_CACHE ? CELESTRAK_FILE.EUTELSAT : CELESTRAK_API.EUTELSAT),
      fetch(USE_CACHE ? CELESTRAK_FILE.ONEWEB : CELESTRAK_API.ONEWEB)
    ]);

    const eutelsatTLE = await eutelsatResponse.text();
    const onewebTLE = await onewebResponse.text();
    
    const eutelsatSats = parseTLE(eutelsatTLE, "EUTELSAT");
    const onewebSats = parseTLE(onewebTLE, "ONEWEB");

    console.log("fetchSatellites");
    const eutelsatSatPromises = eutelsatSats.map(async (sat) => {
        const coverageData = await loadSatelliteCoverage(sat.noradId, sat.name, 'EUTELSAT', 10);
        return {
          id: sat.noradId,
          name: sat.name,
          noradId: sat.noradId,
          type: 'EUTELSAT' as const,
          orbitType: 'GEO' as const, // EUTELSAT satellites are GEO
          satrec: sat.satrec,
          position: calculatePosition(sat),
          referenced_coverages: coverageData || { type: 'FeatureCollection', features: [] },
          coverages: coverageData ? coverageData.features.map((feature, index) => ({
            name: `${sat.name}_beam_${index + 1}`,
            feature: feature
          })) : [{
            name: sat.name,
            feature: { type: 'Feature', properties: {}, geometry: null }
          }],
          capacity: {
            maxThroughput: 100,
            bandwidth: { ku: 500, ka: 300, c: 200 },
            availability: 0.99
          }
        };
      });

    const onewebSatPromises = onewebSats.map(async(sat) => {
        const coverageData = await loadSatelliteCoverage(sat.noradId, sat.name, 'ONEWEB', 600);
        return {
          id: sat.noradId,
          name: sat.name,
          noradId: sat.noradId,
          type: 'ONEWEB' as const,
          orbitType: 'LEO' as const, // ONEWEB satellites are LEO
          satrec: sat.satrec,
          position: calculatePosition(sat),
          referenced_coverages: coverageData || { type: 'FeatureCollection', features: [] },
          coverages: coverageData ? coverageData.features.map((feature, index) => ({
            name: `${sat.name}_zone_${index + 1}`,
            feature: feature
          })) : [{
            name: sat.name,
            feature: { type: 'Feature', properties: {}, geometry: null }
          }],
          capacity: {
            maxThroughput: 8,
            bandwidth: { ku: 250, ka: 150, c: 100 },
            availability: 0.99
          }
        };
      });

    const satellites: SatelliteData[] = [
      ...await Promise.all(eutelsatSatPromises),
      ...await Promise.all(onewebSatPromises)
    ];
   return satellites;
  } catch (error) {
    console.error('Error fetching satellite data:', error);
    return [];
  }
}