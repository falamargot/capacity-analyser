export interface SNPData {
  name: string;
  lat: number;
  lng: number;
  region: string;
}

export const SNPS_DATA: SNPData[] = [
  // AMERICAS (11 sites)
  { name: 'Anchorage', lat: 61.21, lng: -149.89, region: 'Americas' },
  { name: 'Fairbanks', lat: 64.84, lng: -147.72, region: 'Americas' },
  { name: 'Calgary', lat: 51.04, lng: -114.07, region: 'Americas' },
  { name: "St. John's", lat: 47.56, lng: -52.71, region: 'Americas' },
  { name: 'Woodbine', lat: 39.36, lng: -77.06, region: 'Americas' },
  { name: 'Florida', lat: 28.53, lng: -81.37, region: 'Americas' },
  { name: 'Mexico City', lat: 19.43, lng: -99.13, region: 'Americas' },
  { name: 'Maricá', lat: -22.91, lng: -42.81, region: 'Americas' },
  { name: 'Punta Arenas', lat: -53.16, lng: -70.91, region: 'Americas' },
  { name: 'Bogota', lat: 4.71, lng: -74.07, region: 'Americas' },
  { name: 'Lima', lat: -12.04, lng: -77.04, region: 'Americas' },
  // EUROPE & ARCTIC (8 sites)
  { name: 'Svalbard', lat: 78.22, lng: 15.65, region: 'Europe & Arctic' },
  { name: 'Tromsø', lat: 69.64, lng: 18.95, region: 'Europe & Arctic' },
  { name: 'Mornac', lat: 45.68, lng: 0.27, region: 'Europe & Arctic' },
  { name: 'Santander', lat: 43.46, lng: -3.80, region: 'Europe & Arctic' },
  { name: 'Fucino', lat: 41.97, lng: 13.60, region: 'Europe & Arctic' },
  { name: 'Athens', lat: 37.98, lng: 23.72, region: 'Europe & Arctic' },
  { name: 'Makarios', lat: 35.12, lng: 33.32, region: 'Europe & Arctic' },
  { name: 'Nuuk', lat: 64.18, lng: -51.72, region: 'Europe & Arctic' },
  // AFRICA (7 sites)
  { name: 'Dakar', lat: 14.71, lng: -17.46, region: 'Africa' },
  { name: 'Accra', lat: 5.60, lng: -0.18, region: 'Africa' },
  { name: 'Luanda', lat: -8.83, lng: 13.23, region: 'Africa' },
  { name: 'Hartebeesthoek', lat: -25.88, lng: 27.70, region: 'Africa' },
  { name: 'Dar es Salaam', lat: -6.44, lng: 38.90, region: 'Africa' },
  { name: 'Mauritius', lat: -20.16, lng: 57.50, region: 'Africa' },
  { name: 'Djibouti', lat: 11.58, lng: 43.14, region: 'Africa' },
  // MIDDLE EAST & ASIA (10 sites)
  { name: 'Dubai', lat: 25.20, lng: 55.27, region: 'Middle East & Asia' },
  { name: 'Riyadh', lat: 24.71, lng: 46.67, region: 'Middle East & Asia' },
  { name: 'Nur-Sultan', lat: 51.16, lng: 71.44, region: 'Middle East & Asia' },
  { name: 'Tashkent', lat: 41.29, lng: 69.24, region: 'Middle East & Asia' },
  { name: 'Ibaraki', lat: 36.34, lng: 140.44, region: 'Middle East & Asia' },
  { name: 'Singapore', lat: 1.35, lng: 103.81, region: 'Middle East & Asia' },
  { name: 'Depok', lat: -6.40, lng: 106.81, region: 'Middle East & Asia' },
  { name: 'Manila', lat: 14.59, lng: 120.98, region: 'Middle East & Asia' },
  { name: 'Seoul', lat: 37.56, lng: 126.97, region: 'Middle East & Asia' },
  { name: 'Colombo', lat: 6.92, lng: 79.86, region: 'Middle East & Asia' },
  // PACIFIC & AUSTRALIA (6 sites)
  { name: 'Perth', lat: -31.95, lng: 115.86, region: 'Pacific & Australia' },
  { name: 'Merredin', lat: -31.48, lng: 118.27, region: 'Pacific & Australia' },
  { name: 'Darwin', lat: -12.46, lng: 130.84, region: 'Pacific & Australia' },
  { name: 'Majuro', lat: 7.11, lng: 171.18, region: 'Pacific & Australia' },
  { name: 'Guam', lat: 13.44, lng: 144.74, region: 'Pacific & Australia' },
  { name: 'South Tarawa', lat: 1.32, lng: 172.97, region: 'Pacific & Australia' },
];

export const GLOBE_CONFIG = {
  EARTH_TEXTURE: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  TOPOLOGY_TEXTURE: '//unpkg.com/three-globe/example/img/earth-topology.png',
  BACKGROUND_TEXTURE: '//unpkg.com/three-globe/example/img/night-sky.png',
  UPDATE_INTERVAL: 1000,
  INITIAL_VIEW: {
    lat: 48.8566,
    lng: 2.3522,
    altitude: 2.5
  },
  ATMOSPHERE: {
    color: '#ffffff',
    altitude: 0.25
  },
  SATELLITE_COLORS: {
    GEO: '#2563eb', // Blue for GEO (EUTELSAT)
    LEO: '#ef4444'  // Red for LEO (ONEWEB)
  }
};