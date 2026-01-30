import { PerformanceData } from '../utils/pdfExport';

// Interface pour les données de connectivité
interface ConnectivityData {
  satellite: {
    name: string;
    position: { lat: number; lng: number };
  };
  userLEOElevation?: number;
  userLEODistance?: number;
  snpLEOElevation?: number | null;
  snpLEODistance?: number | null;
  snp?: {
    name: string;
  } | null;
}

interface GEOPerformanceData {
  rtt?: number;
  downlinkGbps: number;
  uplinkGbps: number;
  stability: string;
  performanceFactor?: number;
  weatherFactor?: number;
  weatherLabel?: string;
}

interface LEOPerformanceData {
  rtt: number;
  downlinkGbps: number;
  uplinkGbps: number;
  stability: string;
}

// Fonction pour extraire les données de performance LEO
export function extractLEOPerformanceData(
  connectivity: ConnectivityData | null,
  performance: LEOPerformanceData | null
): PerformanceData | null {
  if (!connectivity || !performance) return null;

  const { satellite, userLEOElevation = 0, userLEODistance = 0, snpLEOElevation = 0, snpLEODistance = 0, snp } = connectivity;

  // Calculer l'élévation moyenne
  const avgElevation = snp ? (userLEOElevation + (snpLEOElevation || 0)) / 2 : userLEOElevation;

  // Calculer la distance totale
  const totalDistance = userLEODistance + (snpLEODistance || 0);

  // Construire le chemin radio
  let radioPath = `User > ${satellite.name}`;
  if (snp) {
    radioPath += ` > ${snp.name} > ${satellite.name} > User`;
  } else {
    radioPath += ` (> No SNP connectivity)`;
  }

  return {
    name: satellite.name,
    rtt: performance.rtt,
    downlinkGbps: performance.downlinkGbps,
    uplinkGbps: performance.uplinkGbps,
    elevation: avgElevation,
    stability: performance.stability,
    distance: totalDistance,
    radioPath
  };
}

// Fonction pour extraire les données de performance GEO
export function extractGEOPerformanceData(
  connectivity: { satellite: { name: string; position: { lat: number; lng: number } }; elevation?: number; distance?: number } | null,
  performance: GEOPerformanceData | null
): PerformanceData | null {
  if (!connectivity || !performance) return null;

  const { satellite, elevation = 0, distance = 0 } = connectivity;

  return {
    name: satellite.name,
    rtt: performance.rtt ?? null,
    downlinkGbps: performance.downlinkGbps,
    uplinkGbps: performance.uplinkGbps,
    elevation: elevation,
    stability: performance.stability,
    distance: distance,
    radioPath: `User → ${satellite.name} → User`
  };
}

// Fonction pour calculer la stabilité basée sur l'élévation
export function calculateStability(elevation: number): string {
  if (elevation >= 60) return 'High';
  if (elevation >= 30) return 'Medium';
  return 'Low';
}
