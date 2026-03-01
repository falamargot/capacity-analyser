export function formatCoordinates(point: { lat: number; lng: number; }): string {
  const latDir = point.lat >= 0 ? 'N' : 'S';
  const lngDir = point.lng >= 0 ? 'E' : 'W';
  return `${Math.abs(point.lat).toFixed(2)}°${latDir}, ${Math.abs(point.lng).toFixed(2)}°${lngDir}`;
} 