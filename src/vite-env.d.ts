/// <reference types="vite/client" />

declare module '@turf/circle' {
  const circle: any;
  export default circle;
}

interface Window {
  __leoLastTrace?: {
    mode: 'SINGLE_SITE' | 'SITE_TO_SITE';
    selectedSatelliteA: string | null;
    selectedSatelliteB: string | null;
    rfAvailableA: boolean;
    rfAvailableB: boolean | null;
    selectedSnpA: string | null;
    selectedSnpB: string | null;
    regulatoryStatusA: string | null;
    regulatoryStatusB: string | null;
    failureReason: string | null;
  };
}
