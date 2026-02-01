import { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { SatelliteData } from '../types/satellites';
import { formatCoordinates } from '../utils/formatters';
import { SatelliteScope } from './SatelliteScopeFilter';
import SatelliteDetails from './SatelliteDetails';
import { EARTH_RADIUS_KM, SPEED_OF_LIGHT_RADIO_KM_S, calculateRealTimeCapacity, RealTimeCapacityData, calculateElevationAngle, compute3DDistanceKm } from '../utils/capacityCalculator';
import { SNPS_DATA } from './globe/GlobeConfig';
import { BEAM_LENGTH_KM, TOTAL_BEAMS, BEAM_WIDTH_KM } from '../utils/oneWebComb';
import ExportButton from './ExportButton';

interface CapacityDetailsProps {
  satellites: SatelliteData[];
  onNavigateToLoc?: (lat: number, lng: number, height: number) => void;
  selectedSatellite: SatelliteData | null;
  autoSelectedLEOSatellite: SatelliteData | null;
  autoSelectedGEOSatellite: SatelliteData | null;
  satelliteScope: SatelliteScope;
  onSelectedGEOBeamChange?: (beam: any) => void;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  selectedSNP?: any;
}

// Performance optimization: Memoize component to prevent unnecessary re-renders
const CapacityDetails = memo<CapacityDetailsProps>(({ satellites, selectedPoint, selectedSatellite, autoSelectedLEOSatellite, autoSelectedGEOSatellite, satelliteScope, onSelectedGEOBeamChange, analysisSource, aircraftCallsign, selectedSNP: propSelectedSNP }) => {
  const [nearestLocation, setNearestLocation] = useState<{ city: string; country: string } | null>(null);
  const [realTimeData, setRealTimeData] = useState<RealTimeCapacityData>({
    totalCapacity: 0,
    coveredSatellites: []
  });

  // Add missing refs for ExportButton
  const globeContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);

  type TerminalType = 'fixed' | 'mobile' | 'aviation' | 'maritime';

  const [terminalType, setTerminalType] = useState<TerminalType>('fixed');
  const [previousAnalysisSource, setPreviousAnalysisSource] = useState<'earth' | 'aircraft' | undefined>(undefined);

  // Auto-select aviation terminal type when aircraft is selected
  useEffect(() => {
    if (analysisSource === 'aircraft' && terminalType !== 'aviation') {
      setTerminalType('aviation');
    } else if (analysisSource === 'earth' && previousAnalysisSource === 'aircraft' && terminalType === 'aviation') {
      // Reset to fixed only when switching from aircraft to earth analysis
      setTerminalType('fixed');
    }

    // Update previous analysis source for next comparison
    setPreviousAnalysisSource(analysisSource);
  }, [analysisSource, terminalType, previousAnalysisSource]);

  const TERMINAL_PROFILES: Record<TerminalType, { label: string; maxDlGbps: number; maxUlGbps: number }> = {
    fixed: { label: 'Fixed', maxDlGbps: 0.25, maxUlGbps: 0.05 },
    mobile: { label: 'Mobile', maxDlGbps: 0.10, maxUlGbps: 0.02 },
    aviation: { label: 'Aviation', maxDlGbps: 0.15, maxUlGbps: 0.03 },
    maritime: { label: 'Maritime', maxDlGbps: 0.20, maxUlGbps: 0.04 }
  };

  // Weather selector state and profiles
  type WeatherType = 'clear' | 'light_rain' | 'heavy_rain' | 'storm';

  const [weatherType, setWeatherType] = useState<WeatherType>('clear');
  const [autoWeatherEnabled, setAutoWeatherEnabled] = useState<boolean>(true);

  const WEATHER_PROFILES: Record<WeatherType, { label: string; factor: number }> = {
    clear: { label: 'Clear sky', factor: 1.0 },
    light_rain: { label: 'Light rain', factor: 0.85 },
    heavy_rain: { label: 'Heavy rain', factor: 0.65 },
    storm: { label: 'Storm', factor: 0.45 }
  };

  // Calculate GEO oblique distance using proper geometry
  const calculateGEODistanceKm = (userPoint: { lat: number; lng: number }, satellite: SatelliteData): number => {
    const lat = userPoint.lat * Math.PI / 180;
    const deltaLng = (userPoint.lng - satellite.position.lng) * Math.PI / 180;

    const cosPsi = Math.cos(lat) * Math.cos(deltaLng);
    const geoRadius = EARTH_RADIUS_KM + satellite.position.alt;

    return Math.sqrt(geoRadius * geoRadius + EARTH_RADIUS_KM * EARTH_RADIUS_KM - 2 * geoRadius * EARTH_RADIUS_KM * cosPsi);
  };

  // Select best GEO beam for a given point
  const selectBestGEOBeam = useCallback((userPoint: { lat: number; lng: number }, geoSatellites: SatelliteData[]) => {
    let bestBeam = null;
    let bestElevation = -1;
    let bestSatellite = null;

    for (const satellite of geoSatellites) {
      if (!satellite.coverages || satellite.coverages.length === 0) continue;

      for (const coverage of satellite.coverages) {
        const geometry = coverage.feature?.geometry;
        if (geometry && geometry.type === 'Polygon') {
          const ring = geometry.coordinates[0] as unknown as number[][];
          if (isPointInPolygon(userPoint, ring)) {
            const elevation = calculateElevationAngle(userPoint, satellite);
            if (elevation > bestElevation) {
              bestElevation = elevation;
              bestBeam = coverage;
              bestSatellite = satellite;
            }
          }
        }
      }
    }

    return { satellite: bestSatellite, beam: bestBeam, elevation: bestElevation };
  }, []);

  // Calculate theoretical LEO performance metrics
  const calculateLEOPerformance = useCallback((
    userLEODistance: number,
    snpLEODistance: number,
    userLEOElevation: number,
    snpLEOElevation: number,
    userLat: number,
    userLng: number,
    satLat: number,
    satLng: number
  ) => {
    // 1) RTT calculation using effective radio propagation speed
    // We approximate a bent-pipe path: User -> Sat -> SNP (ground station) -> Sat -> User
    const oneWayDistanceKm = userLEODistance + snpLEODistance;
    const rttMilliseconds = Math.round((2 * oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S * 1000 / 5) * 5);

    // Ensure minimum RTT of 5ms, never show 0
    const rtt = Math.max(5, rttMilliseconds);

    // 2) Throughput estimation (theoretical but realistic for a USER link)
    // IMPORTANT: satellite.capacity.maxThroughput represents a global / system capacity,
    // not what a single user terminal can achieve.
    // We therefore cap by a user-terminal-like max throughput.
    // These defaults are intentionally conservative and can be made configurable later.
    const profile = TERMINAL_PROFILES[terminalType];
    const MAX_USER_DL_Gbps = profile.maxDlGbps;
    const MAX_USER_UL_Gbps = profile.maxUlGbps;
    // Aviation terminals are above clouds, so weather factor is always 1.0
    const weatherFactor = terminalType === 'aviation' ? 1.0 : WEATHER_PROFILES[weatherType].factor;

    // Limiting link = the weaker geometry between user<->sat and snp<->sat
    const limitingElevation = Math.min(userLEOElevation, snpLEOElevation);
    const limitingDistanceKm = Math.max(userLEODistance, snpLEODistance);

    // Footprint factor (Option B): softly degrade performance when the user is near/outside the OneWeb comb beams.
    // This is a simplified ground model of the 16 elliptical beams
    // NOTE: This is not an RF model, but a UX-friendly approximation.
    const a = BEAM_LENGTH_KM / 2; // semi-major (km)
    const b = BEAM_WIDTH_KM / 2;  // semi-minor (km)

    // Convert lat/lng delta to local kilometers (equirectangular approximation)
    const kmPerDegLat = 111.32;
    const lat0Rad = (satLat * Math.PI) / 180;
    const kmPerDegLng = kmPerDegLat * Math.cos(lat0Rad);

    const dxKm = (userLng - satLng) * kmPerDegLng; // East-West
    const dyKm = (userLat - satLat) * kmPerDegLat; // North-South

    // Compute the best (max) factor over all beams
    const middle = (TOTAL_BEAMS - 1) / 2;

    const footprintFactor = (() => {
      let best = 0;

      for (let i = 0; i < TOTAL_BEAMS; i++) {
        // Beam center offset along North-South (stacked row)
        const beamCenterOffsetY = (i - middle) * BEAM_WIDTH_KM;

        // Shift user position into the beam local frame
        const x = dxKm;
        const y = dyKm - beamCenterOffsetY;

        // Ellipse normalized radius squared
        const r2 = (x * x) / (a * a) + (y * y) / (b * b);

        // Soft mapping:
        // - inside (r2 <= 1): factor from 1.0 at center to 0.5 at edge
        // - outside: exponentially decays, but not instantly zero ("between beams" stays possible but degraded)
        let f = 0;
        if (r2 <= 1) {
          f = 1.0 - 0.5 * r2; // center=1, edge=0.5
        } else {
          // r2=1 -> 0.5, then decay
          f = 0.5 * Math.exp(-(r2 - 1));
        }

        if (f > best) best = f;
      }

      // Clamp for safety
      return Math.max(0, Math.min(1, best));
    })();

    // Elevation factor: 0 below 15°, then linearly ramp to 1 at 50°
    const elevationFactor = (() => {
      if (limitingElevation < 15) return 0;
      if (limitingElevation >= 50) return 1;
      return (limitingElevation - 15) / (50 - 15); // 0..1
    })();

    // Distance factor: heuristic degradation with slant range
    // Keeps the model simple while avoiding unrealistically high throughput at long distances.
    const distanceFactor = (() => {
      const goodKm = 800;
      const badKm = 2200;
      if (limitingDistanceKm <= goodKm) return 1;
      if (limitingDistanceKm >= badKm) return 0.4;
      const t = (limitingDistanceKm - goodKm) / (badKm - goodKm);
      return 1 - 0.6 * t; // 1 -> 0.4
    })();

    // Handover factor: degrade performance when the pass is close to ending.
    // We approximate "time to exit" from elevation only (simple but effective).
    const estimateTimeToExitSec = (elevDeg: number) => {
      const x = Math.max(0, Math.min(1, elevDeg / 90));
      return 480 * Math.pow(x, 1.6); // up to ~8 minutes
    };

    const timeToExitUserSec = estimateTimeToExitSec(userLEOElevation);
    const timeToExitSnpSec = estimateTimeToExitSec(snpLEOElevation);
    const limitingTimeToExitSec = Math.min(timeToExitUserSec, timeToExitSnpSec);

    const handoverFactor = (() => {
      if (limitingTimeToExitSec < 45) return 0.4;
      if (limitingTimeToExitSec < 120) {
        return 0.4 + (limitingTimeToExitSec - 45) / (120 - 45) * (1.0 - 0.4);
      }
      return 1.0;
    })();

    // Overall performance factor
    const performanceFactor = elevationFactor * distanceFactor * handoverFactor * footprintFactor * weatherFactor;

    const downlinkGbps = performanceFactor > 0 ? MAX_USER_DL_Gbps * performanceFactor : 0;
    const uplinkGbps = performanceFactor > 0 ? MAX_USER_UL_Gbps * performanceFactor : 0;

    // 3) Stability determination (derived from limiting elevation + handover)
    let stability: string;
    if (performanceFactor <= 0) {
      stability = 'Unstable';
    } else if (limitingElevation >= 40 && handoverFactor >= 0.9) {
      stability = 'High';
    } else if (limitingElevation >= 25 && handoverFactor >= 0.7) {
      stability = 'Medium';
    } else if (limitingElevation >= 15) {
      stability = 'Low';
    } else {
      stability = 'Unstable';
    }

    return {
      rtt,
      downlinkGbps,
      uplinkGbps,
      stability,
      performanceFactor,
      footprintFactor,
      weatherFactor,
      weatherLabel: WEATHER_PROFILES[weatherType].label
    };
  }, [terminalType, weatherType]);

  const calculateGEOPerformance = useCallback((elevationDeg: number) => {
    const profile = TERMINAL_PROFILES[terminalType];
    // Aviation terminals are above clouds, so weather factor is always 1.0
    const weatherFactor = terminalType === 'aviation' ? 1.0 : WEATHER_PROFILES[weatherType].factor;

    // Not usable below 10° elevation
    if (elevationDeg < 10) {
      return {
        downlinkGbps: 0,
        uplinkGbps: 0,
        stability: 'Unstable',
        performanceFactor: 0,
        weatherFactor,
        weatherLabel: WEATHER_PROFILES[weatherType].label
      };
    }

    // Elevation factor: ramp 10° -> 50°
    const elevationFactor = (() => {
      if (elevationDeg >= 50) return 1;
      return (elevationDeg - 10) / (50 - 10);
    })();

    // Keep a small floor (prevents unrealistic 0 Mbps when link is usable)
    const performanceFactor = Math.max(0.15, elevationFactor) * weatherFactor;

    const downlinkGbps = profile.maxDlGbps * performanceFactor;
    const uplinkGbps = profile.maxUlGbps * performanceFactor;

    const stability =
      elevationDeg >= 40 ? 'High' :
        elevationDeg >= 25 ? 'Medium' :
          elevationDeg >= 15 ? 'Low' :
            'Unstable';

    return {
      downlinkGbps,
      uplinkGbps,
      stability,
      performanceFactor,
      weatherFactor,
      weatherLabel: WEATHER_PROFILES[weatherType].label
    };
  }, [terminalType, weatherType]);

  // Simple point-in-polygon check
  const isPointInPolygon = (point: { lat: number; lng: number }, ring: number[][]): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];

      const intersect = ((yi > point.lat) !== (yj > point.lat))
        && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Use selectedPoint as the unified active point
  const activePoint = useMemo(() => {
    return selectedPoint;
  }, [selectedPoint]);

  // Auto-weather selection using Open-Meteo (no API key)
  useEffect(() => {
    if (!autoWeatherEnabled) return;
    if (!activePoint) return;

    let cancelled = false;

    const mapPrecipToWeatherType = (precipMmPerHour: number): WeatherType => {
      if (!isFinite(precipMmPerHour)) return 'clear';
      if (precipMmPerHour <= 0.0) return 'clear';
      if (precipMmPerHour <= 1.0) return 'light_rain';
      if (precipMmPerHour <= 5.0) return 'heavy_rain';
      return 'storm';
    };

    const fetchWeather = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${activePoint.lat}&longitude=${activePoint.lng}&current=precipitation,rain,showers&timezone=UTC`;
        const res = await fetch(url);
        const data = await res.json();

        // Open-Meteo returns `current` values, precipitation is in mm
        const current = data?.current;
        const precipitation = Number(current?.precipitation ?? 0);

        const nextType = mapPrecipToWeatherType(precipitation);

        if (!cancelled) {
          setWeatherType(nextType);
          setLastWeatherSource('auto');
        }
      } catch (e) {
        // If the API fails, keep the existing selection
        // (Do not force a change; fail silently)
      }
    };

    fetchWeather();

    // If analysis is aircraft, refresh periodically (near real-time)
    const intervalMs = analysisSource === 'aircraft' ? 30_000 : 0;
    const interval = intervalMs > 0 ? setInterval(fetchWeather, intervalMs) : null;

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [activePoint, autoWeatherEnabled, analysisSource]);

  // Get resolved LEO connectivity data for display
  const resolvedLEOConnectivity = useMemo(() => {
    if (!activePoint || satellites.length === 0) return null;

    // Use the actual resolved LEO satellite from props (if available)
    let activeLEOSat: SatelliteData | null = null;

    if (autoSelectedLEOSatellite) {
      // Use the actual resolved LEO satellite
      activeLEOSat = autoSelectedLEOSatellite;
    } else {
      // Fallback: Find closest LEO satellite
      const leoSatellites = satellites.filter(sat => sat.type === 'ONEWEB');
      if (leoSatellites.length === 0) return null;

      activeLEOSat = leoSatellites.reduce((closest, sat) => {
        const distToUser = compute3DDistanceKm(activePoint, { lat: sat.position.lat, lng: sat.position.lng, alt: sat.position.alt });
        const closestDist = compute3DDistanceKm(activePoint, { lat: closest.position.lat, lng: closest.position.lng, alt: closest.position.alt });
        return distToUser < closestDist ? sat : closest;
      });
    }

    // Check if we have a connected SNP (from auto-selection)
    if (!propSelectedSNP) {
      // No SNP connectivity - return satellite only
      return {
        satellite: activeLEOSat,
        snp: null,
        userLEOElevation: calculateElevationAngle(activePoint, activeLEOSat),
        snpLEOElevation: null,
        userLEODistance: compute3DDistanceKm(activePoint, { lat: activeLEOSat.position.lat, lng: activeLEOSat.position.lng, alt: activeLEOSat.position.alt }),
        snpLEODistance: null
      };
    }

    // We have SNP connectivity - use the selected SNP
    const userLEOElevation = calculateElevationAngle(activePoint, activeLEOSat);
    const snpLEOElevation = calculateElevationAngle({ lat: propSelectedSNP.lat, lng: propSelectedSNP.lng }, activeLEOSat);

    const userLEODistance = compute3DDistanceKm(activePoint, { lat: activeLEOSat.position.lat, lng: activeLEOSat.position.lng, alt: activeLEOSat.position.alt });
    const snpLEODistance = compute3DDistanceKm({ lat: propSelectedSNP.lat, lng: propSelectedSNP.lng }, { lat: activeLEOSat.position.lat, lng: activeLEOSat.position.lng, alt: activeLEOSat.position.alt });

    return {
      satellite: activeLEOSat,
      snp: propSelectedSNP,
      userLEOElevation,
      snpLEOElevation,
      userLEODistance,
      snpLEODistance
    };
  }, [activePoint, satellites, autoSelectedLEOSatellite, propSelectedSNP]);

  // Get resolved GEO connectivity data for display
  const resolvedGEOConnectivity = useMemo(() => {
    if (!activePoint || satellites.length === 0) return null;

    // Only consider GEO satellites when filter is ALL or GEO
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return null;

    const geoSatellites = satellites.filter(sat => sat.type === 'EUTELSAT');
    if (geoSatellites.length === 0) return null;

    // Select best GEO beam for the active point
    const bestBeam = selectBestGEOBeam(activePoint, geoSatellites);

    if (!bestBeam.satellite) return null;

    // Compute GEO distance and RTT
    const geoDistance = calculateGEODistanceKm(activePoint, bestBeam.satellite);
    const geoRTT = Math.round(2 * geoDistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000);

    return {
      satellite: bestBeam.satellite,
      beam: bestBeam.beam,
      elevation: bestBeam.elevation,
      distance: geoDistance,
      rtt: geoRTT
    };
  }, [activePoint, satellites, satelliteScope, selectBestGEOBeam]);

  // Notify parent when selected GEO beam changes
  useEffect(() => {
    if (onSelectedGEOBeamChange && resolvedGEOConnectivity?.beam) {
      onSelectedGEOBeamChange(resolvedGEOConnectivity.beam);
    }
  }, [resolvedGEOConnectivity, onSelectedGEOBeamChange]);


  // Performance optimization: Memoize SNP detection to prevent recalculation
  const selectedSNP = useMemo(() => {
    if (!selectedPoint) return null;
    return SNPS_DATA.find(snp =>
      Math.abs(snp.lat - selectedPoint.lat) < 0.01 && Math.abs(snp.lng - selectedPoint.lng) < 0.01
    ) || null;
  }, [selectedPoint]);

  const satellitesRef = useRef<SatelliteData[]>(satellites);
  const selectedPointRef = useRef<{ lat: number; lng: number } | null>(selectedPoint);
  const activePointRef = useRef<{ lat: number; lng: number } | null>(activePoint);
  const selectedSatelliteRef = useRef<SatelliteData | null>(selectedSatellite);

  useEffect(() => {
    satellitesRef.current = satellites;
  }, [satellites]);

  useEffect(() => {
    selectedPointRef.current = selectedPoint;
  }, [selectedPoint]);

  useEffect(() => {
    activePointRef.current = activePoint;
  }, [activePoint]);

  useEffect(() => {
    selectedSatelliteRef.current = selectedSatellite;
  }, [selectedSatellite]);

  useEffect(() => {
    const fetchNearestLocation = async () => {
      if (!activePoint) return;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${activePoint.lat}&lon=${activePoint.lng}&zoom=10`
        );
        const data = await response.json();

        if (data && data.address) {
          const city = data.address.city || data.address.town || data.address.village;
          const country = data.address.country;
          if (city && country) {
            setNearestLocation({ city, country });
          } else if (country) {
            setNearestLocation({ city: '', country });
          } else {
            setNearestLocation(null);
          }
        } else {
          setNearestLocation(null);
        }
      } catch (error) {
        console.error('Error fetching nearest location:', error);
        setNearestLocation(null);
      }
    };

    if (activePoint) {
      fetchNearestLocation();
    } else {
      setNearestLocation(null);
    }
  }, [activePoint]);

  useEffect(() => {
    const updateRealTimeData = () => {
      const newRealTimeData = calculateRealTimeCapacity(
        satellitesRef.current,
        activePointRef.current,
        selectedSatelliteRef.current
      );

      setRealTimeData((prev) => {
        if (JSON.stringify(prev) !== JSON.stringify(newRealTimeData)) {
          return newRealTimeData;
        }
        return prev;
      });
    };

    updateRealTimeData();
    const interval = setInterval(updateRealTimeData, 1000);
    return () => clearInterval(interval);
  }, [activePoint, satellites, selectedSatellite]);

  if (!selectedPoint && !selectedSatellite) {
    return (
      <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-slate-800 transition-colors duration-300">
        <p className="text-lg text-center">Click on the globe to analyze satellite capacity</p>
      </div>
    );
  }

  if (selectedSatellite) {
    return <SatelliteDetails satellites={satellites} selectedSatellite={selectedSatellite} />;
  }

  // New user-centric structure for USER_LOCATION_SELECTED
  return (
    <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col transition-colors duration-300">
      <div className="p-4 flex flex-col h-full">
        <div className="flex-none">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                Capacity Analysis
                {activePoint && (
                  <span className="ml-2 text-lg font-semibold text-gray-500 dark:text-gray-400">
                    {selectedSNP ? `at ${selectedSNP.name}` : `at (${formatCoordinates({ lat: activePoint.lat, lng: activePoint.lng })})`}
                  </span>
                )}
              </h2>
              {selectedSNP ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1">
                  SNP Ground Station - {selectedSNP.region}
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Position: ({formatCoordinates({ lat: selectedSNP.lat, lng: selectedSNP.lng })})
                  </div>
                </div>
              ) : analysisSource === 'aircraft' && aircraftCallsign ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1">
                  <span>Aircraft: {aircraftCallsign}</span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                    Altitude: {activePoint?.altitude ? `${activePoint.altitude.toFixed(1)} km` : 'Unknown'}
                  </span>
                </div>
              ) : nearestLocation ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1">
                  {nearestLocation.country}
                  {nearestLocation.city && ` (Near ${nearestLocation.city})`}
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Altitude: {activePoint?.altitude ? `${activePoint.altitude.toFixed(1)} km` : 'Ground level'}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1">
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Altitude: {activePoint?.altitude ? `${activePoint.altitude.toFixed(1)} km` : 'Ground level'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mb-4">
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">User Terminal</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-16">Type:</label>
                  <select
                    value={terminalType}
                    onChange={(e) => setTerminalType(e.target.value as TerminalType)}
                    className="flex-1 pl-3 pr-8 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-gray-100 transition-colors"
                    disabled={analysisSource === 'aircraft'}
                    style={{
                      backgroundImage: analysisSource === 'aircraft' ? 'none' : `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3E%3Cpath fill='%236B7280' d='M2 0L0 2h4zm0 5L0 3h4z'/%3E%3C/svg>")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right .5rem center',
                      backgroundSize: '.8em .8em',
                      opacity: analysisSource === 'aircraft' ? 0.5 : 1
                    }}
                  >
                    {Object.entries(TERMINAL_PROFILES).map(([key, p]) => (
                      <option key={key} value={key}>
                        {(() => {
                          const icon = key === 'fixed' ? '🏠 ' :
                            key === 'mobile' ? '🚐 ' :
                              key === 'aviation' ? '✈️ ' : '🚢 ';
                          return `${icon}${p.label}`;
                        })()}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Max: {Math.round(TERMINAL_PROFILES[terminalType].maxDlGbps * 1000)} / {Math.round(TERMINAL_PROFILES[terminalType].maxUlGbps * 1000)} Mbps
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center space-x-3">
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-16">Weather:</label>
                    <select
                      value={weatherType}
                      onChange={(e) => {
                        setWeatherType(e.target.value as WeatherType);
                        setAutoWeatherEnabled(false);
                      }}
                      className="flex-1 pl-3 pr-8 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-gray-100 transition-colors"
                      disabled={terminalType === 'aviation'}
                      style={{
                        backgroundImage: terminalType === 'aviation' ? 'none' : `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3E%3Cpath fill='%236B7280' d='M2 0L0 2h4zm0 5L0 3h4z'/%3E%3Csvg>")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right .5rem center',
                        backgroundSize: '.8em .8em',
                        opacity: terminalType === 'aviation' ? 0.5 : 1
                      }}
                    >
                      {Object.entries(WEATHER_PROFILES).map(([key, p]) => (
                        <option key={key} value={key}>
                          {(() => {
                            const icon = key === 'clear' ? '☀️ ' :
                              key === 'light_rain' ? '🌦️ ' :
                                key === 'heavy_rain' ? '🌧️ ' : '⛈️ ';
                            return `${icon}${p.label}`;
                          })()}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      x {terminalType === 'aviation' ? '1.00' : WEATHER_PROFILES[weatherType].factor.toFixed(2)}
                    </span>
                    <label className={`flex items-center space-x-1 text-xs whitespace-nowrap ${terminalType === 'aviation' ? 'text-gray-400 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
                      <input
                        type="checkbox"
                        checked={autoWeatherEnabled}
                        onChange={(e) => {
                          setAutoWeatherEnabled(e.target.checked);
                        }}
                        disabled={terminalType === 'aviation'}
                        className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
                      />
                      <span>Real</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* 2) Constellation-based Connectivity Blocks */}
          {(satelliteScope === 'LEO' || satelliteScope === 'ALL') && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-1" style={{ color: '#db2777' }}>LEO Connectivity</h3>
              <div className="space-y-4">
                {/* LEO Radio Path */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 mt-1 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#db2777' }}>Radio Path (LEO)</h4>
                  {resolvedLEOConnectivity ? (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3">
                      {resolvedLEOConnectivity.snp ? (
                        <div>{analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → {resolvedLEOConnectivity.satellite.name} → {resolvedLEOConnectivity.snp.name} → {resolvedLEOConnectivity.satellite.name} → {analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'}</div>
                      ) : (
                        <div>{analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → {resolvedLEOConnectivity.satellite.name} (→ No SNP connectivity)</div>
                      )}
                      {resolvedLEOConnectivity.snp ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                          <div>
                            <div>{analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → {resolvedLEOConnectivity.satellite.name}</div>
                            <div className="ml-4">→ Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}° | Distance: {resolvedLEOConnectivity.userLEODistance?.toFixed(0)} km ({(resolvedLEOConnectivity.userLEODistance * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000).toFixed(1)} ms)</div>
                          </div>
                          <div>
                            <div>{resolvedLEOConnectivity.snp.name} → {resolvedLEOConnectivity.satellite.name}</div>
                            <div className="ml-4">→ Elevation: {resolvedLEOConnectivity.snpLEOElevation?.toFixed(1)}° | Distance: {resolvedLEOConnectivity.snpLEODistance?.toFixed(0)} km ({((resolvedLEOConnectivity.snpLEODistance || 0) * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000).toFixed(1)} ms)</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 dark:text-gray-400 text-left">
                          <div>→ Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}° | Distance: {resolvedLEOConnectivity.userLEODistance?.toFixed(0)} km ({(resolvedLEOConnectivity.userLEODistance * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000).toFixed(1)} ms)</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                      <div>No valid LEO/SNP connectivity for this location.</div>
                    </div>
                  )}
                </div>
                {/* LEO Estimated Performance */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#db2777' }}>Estimated Performance (LEO)</h4>
                  {resolvedLEOConnectivity && resolvedLEOConnectivity.snp ? (
                    (() => {
                      const performance = calculateLEOPerformance(
                        resolvedLEOConnectivity.userLEODistance,
                        resolvedLEOConnectivity.snpLEODistance || 0,
                        resolvedLEOConnectivity.userLEOElevation,
                        resolvedLEOConnectivity.snpLEOElevation || 0,
                        activePoint!.lat,
                        activePoint!.lng,
                        resolvedLEOConnectivity.satellite.position.lat,
                        resolvedLEOConnectivity.satellite.position.lng
                      );
                      return (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Round-trip latency (RTT):</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{performance.rtt} ms</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Downlink throughput:</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {performance.performanceFactor > 0
                                ? (performance.downlinkGbps >= 1
                                  ? `${performance.downlinkGbps.toFixed(1)} Gbps`
                                  : `${Math.round(performance.downlinkGbps * 1000)} Mbps`)
                                : 'Not usable'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Uplink throughput:</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {performance.performanceFactor > 0
                                ? (performance.uplinkGbps >= 1
                                  ? `${performance.uplinkGbps.toFixed(1)} Gbps`
                                  : `${Math.round(performance.uplinkGbps * 1000)} Mbps`)
                                : 'Not usable'}
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  ) : resolvedLEOConnectivity ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Round-trip latency (RTT):</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">—</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Downlink throughput:</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">—</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Uplink throughput:</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">—</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                        No performance data available without SNP connectivity
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Round-trip latency (RTT):</span>
                        <span className="text-sm font-semibold text-gray-900">— ms</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Downlink throughput:</span>
                        <span className="text-sm font-semibold text-gray-900">— Gbps</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Uplink throughput:</span>
                        <span className="text-sm font-semibold text-gray-900">— Gbps</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(satelliteScope === 'GEO' || satelliteScope === 'ALL') && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-1" style={{ color: '#2563eb' }}>GEO Connectivity</h3>
              <div className="space-y-4">
                {/* GEO Radio Path */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 mt-1 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#2563eb' }}>Radio Path (GEO)</h4>
                  {resolvedGEOConnectivity ? (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3">
                      <div>{analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} ↔ {resolvedGEOConnectivity.satellite.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 text-left">
                        <div>→ Elevation: {resolvedGEOConnectivity.elevation.toFixed(1)}° | Distance: {resolvedGEOConnectivity.distance.toFixed(0)} km ({resolvedGEOConnectivity.rtt} ms)</div>
                        {resolvedGEOConnectivity.beam && (
                          <div className="mt-1">→ Direct Beam: {resolvedGEOConnectivity.beam.name}</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                      <div>No GEO visibility or beam coverage.</div>
                    </div>
                  )}
                </div>
                {/* GEO Estimated Performance */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#2563eb' }}>Estimated Performance (GEO)</h4>
                  {resolvedGEOConnectivity ? (
                    (() => {
                      const performance = calculateGEOPerformance(resolvedGEOConnectivity.elevation);
                      return (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Round-trip latency (RTT):</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{resolvedGEOConnectivity.rtt} ms</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Downlink throughput:</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {performance.performanceFactor > 0
                                ? (performance.downlinkGbps >= 1
                                  ? `${performance.downlinkGbps.toFixed(1)} Gbps`
                                  : `${Math.round(performance.downlinkGbps * 1000)} Mbps`)
                                : 'Not usable'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Uplink throughput:</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {performance.performanceFactor > 0
                                ? (performance.uplinkGbps >= 1
                                  ? `${performance.uplinkGbps.toFixed(1)} Gbps`
                                  : `${Math.round(performance.uplinkGbps * 1000)} Mbps`)
                                : 'Not usable'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Stability:</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {performance.stability}
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Round-trip latency (RTT):</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">—</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Downlink throughput:</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">—</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Uplink throughput:</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">—</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                        No GEO coverage available
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Export PDF Button */}
          {activePoint && (
            <div className="mb-4">
              <ExportButton
                location={{
                  lat: activePoint.lat,
                  lng: activePoint.lng,
                  name: `${nearestLocation?.city || ''}, ${nearestLocation?.country || ''}`
                }}
                leoData={resolvedLEOConnectivity ? {
                  name: resolvedLEOConnectivity.satellite.name,
                  elevation: resolvedLEOConnectivity.userLEOElevation || 0,
                  rtt: resolvedLEOConnectivity.snp ?
                    (resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0)) * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000 :
                    resolvedLEOConnectivity.userLEODistance * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000,
                  downlinkGbps: resolvedLEOConnectivity.snp ?
                    (() => {
                      const performance = calculateLEOPerformance(
                        resolvedLEOConnectivity.userLEODistance,
                        resolvedLEOConnectivity.snpLEODistance || 0,
                        resolvedLEOConnectivity.userLEOElevation,
                        resolvedLEOConnectivity.snpLEOElevation || 0,
                        activePoint.lat,
                        activePoint.lng,
                        resolvedLEOConnectivity.satellite.position.lat,
                        resolvedLEOConnectivity.satellite.position.lng
                      );
                      return performance.downlinkGbps;
                    })() : 0,
                  uplinkGbps: resolvedLEOConnectivity.snp ?
                    (() => {
                      const performance = calculateLEOPerformance(
                        resolvedLEOConnectivity.userLEODistance,
                        resolvedLEOConnectivity.snpLEODistance || 0,
                        resolvedLEOConnectivity.userLEOElevation,
                        resolvedLEOConnectivity.snpLEOElevation || 0,
                        activePoint.lat,
                        activePoint.lng,
                        resolvedLEOConnectivity.satellite.position.lat,
                        resolvedLEOConnectivity.satellite.position.lng
                      );
                      return performance.uplinkGbps;
                    })() : 0,
                  stability: resolvedLEOConnectivity.snp ?
                    (() => {
                      const performance = calculateLEOPerformance(
                        resolvedLEOConnectivity.userLEODistance,
                        resolvedLEOConnectivity.snpLEODistance || 0,
                        resolvedLEOConnectivity.userLEOElevation,
                        resolvedLEOConnectivity.snpLEOElevation || 0,
                        activePoint.lat,
                        activePoint.lng,
                        resolvedLEOConnectivity.satellite.position.lat,
                        resolvedLEOConnectivity.satellite.position.lng
                      );
                      return performance.stability;
                    })() : 'Unstable',
                  distance: resolvedLEOConnectivity.userLEODistance,
                  radioPath: resolvedLEOConnectivity.snp ?
                    `${analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → ${resolvedLEOConnectivity.satellite.name} → ${resolvedLEOConnectivity.snp.name} → ${resolvedLEOConnectivity.satellite.name} → ${analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'}` :
                    `${analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → ${resolvedLEOConnectivity.satellite.name} (→ No SNP connectivity)`
                } : null}
                geoData={resolvedGEOConnectivity ? {
                  name: resolvedGEOConnectivity.satellite.name,
                  elevation: resolvedGEOConnectivity.elevation || 0,
                  rtt: resolvedGEOConnectivity.rtt || 0,
                  downlinkGbps: (() => {
                    const performance = calculateGEOPerformance(resolvedGEOConnectivity.elevation || 0);
                    return performance.downlinkGbps;
                  })(),
                  uplinkGbps: (() => {
                    const performance = calculateGEOPerformance(resolvedGEOConnectivity.elevation || 0);
                    return performance.uplinkGbps;
                  })(),
                  stability: (() => {
                    const performance = calculateGEOPerformance(resolvedGEOConnectivity.elevation || 0);
                    return performance.stability;
                  })(),
                  distance: resolvedGEOConnectivity.distance || 0,
                  radioPath: `${analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → ${resolvedGEOConnectivity.satellite.name} → ${analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'}`
                } : null}
                globeRef={globeContainerRef}
                cesiumViewer={viewerRef.current}
              />
            </div>
          )}

          {selectedPoint && (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2 space-y-1">
              <div>
                Total visible capacity: {realTimeData.totalCapacity.toLocaleString()} Gbps · {realTimeData.coveredSatellites.length} {satelliteScope === 'ALL' ? 'satellites' : satelliteScope.toLowerCase()} satellites in coverage
              </div>
              {analysisSource === 'aircraft' && aircraftCallsign && (
                <div className="text-blue-600 font-medium">
                  Analysis source: Aircraft {aircraftCallsign}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}); // End of memo component

export default CapacityDetails;