import { useEffect, useRef, useState, useMemo, useCallback, memo, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { PerformancePanel } from './MetricWidgets';
import { SatelliteData } from '../types/satellites';
import { formatCoordinates } from '../utils/formatters';
import { SatelliteScope } from './SatelliteScopeFilter';
import SatelliteDetails from './SatelliteDetails';
import { SPEED_OF_LIGHT_RADIO_KM_S, calculateRealTimeCapacity, RealTimeCapacityData, calculateElevationAngle, compute3DDistanceKm } from '../utils/capacityCalculator';
import { SNPS_DATA } from './globe/GlobeConfig';
import { BEAM_LENGTH_KM, TOTAL_BEAMS, BEAM_WIDTH_KM } from '../utils/oneWebComb';
import { findConnectedBeamIndex } from '../utils/rfConnectivity';
import { JulianDate } from 'cesium';
import ExportButton from './ExportButton';
import CoverageSelector from './CoverageSelector';
import type { CandidateCoverage, MobileAnalysisMetrics } from '../types/analysis';
import {
  WEATHER_ATTENUATION_DB,
  type WeatherCondition,
} from '../utils/realisticSimulation';
import { analyzeLeoConnectivity } from '../utils/leoConnectivityModel';
import { computeGeoConnectivity } from '../utils/geoCoverageSelection';
import { useSimulation, getCorridorIndex, getCorridorRange, getDcThroughputScale, CORRIDOR_COUNT } from '../contexts/SimulationContext';
import PassBeamTimeline from './PassBeamTimeline';
import { SectionTooltip } from './SectionTooltip';

// Module-level stable definitions to avoid recreating inside component and
// to keep hook dependency arrays clean.
type TerminalType = 'fixed' | 'mobile' | 'aviation' | 'maritime';
const TERMINAL_PROFILES: Record<TerminalType, { label: string; maxDlGbps: number; maxUlGbps: number }> = {
  fixed: { label: 'Fixed', maxDlGbps: 0.25, maxUlGbps: 0.05 },
  mobile: { label: 'Mobile', maxDlGbps: 0.10, maxUlGbps: 0.02 },
  aviation: { label: 'Aviation', maxDlGbps: 0.15, maxUlGbps: 0.03 },
  maritime: { label: 'Maritime', maxDlGbps: 0.20, maxUlGbps: 0.04 }
};

type WeatherType = 'clear' | 'light_rain' | 'heavy_rain' | 'storm';
const WEATHER_PROFILES: Record<WeatherType, { label: string; condition: WeatherCondition }> = {
  clear: { label: 'Clear Sky', condition: 'CLEAR' },
  light_rain: { label: 'Clouds', condition: 'CLOUDS' },
  heavy_rain: { label: 'Rain', condition: 'RAIN' },
  storm: { label: 'Rain (Heavy)', condition: 'RAIN' },
};

// Keep RTT bars visually comparable between LEO and GEO panels.
const RTT_VISUAL_SCALE_MAX_MS = 600;

const toWeatherCondition = (wt: WeatherType): WeatherCondition => {
  if (wt === 'clear') return 'CLEAR';
  if (wt === 'light_rain') return 'CLOUDS';
  return 'RAIN';
};

// Physics-based factor: 10^(dB/10) as linear power ratio.
// Defined once at module level — stable reference, no need to wrap in useCallback.
const getWeatherFactor = (wt: WeatherType, isAviation: boolean): number => {
  if (isAviation) return 1.0;
  return Math.pow(10, WEATHER_ATTENUATION_DB[toWeatherCondition(wt)] / 10);
};

const formatGeoStabilityTooltip = (elevationDeg: number, isUserLinkUnstable: boolean): string => {
  const currentRule = isUserLinkUnstable
    ? 'Current status: Unstable because user-to-satellite elevation is below 5 deg.'
    : elevationDeg >= 40
      ? 'Current status: High because elevation is at least 40 deg.'
      : elevationDeg >= 25
        ? 'Current status: Medium because elevation is between 25 deg and 40 deg.'
        : elevationDeg >= 5
          ? 'Current status: Low because elevation is between 5 deg and 25 deg.'
          : 'Current status: Unstable because elevation is below 5 deg.';

  return `GEO stability rule: Unstable below 5 deg elevation, Low from 5 deg to below 25 deg, Medium from 25 deg to below 40 deg, High at 40 deg and above. Current elevation: ${elevationDeg.toFixed(1)} deg. ${currentRule}`;
};

interface CapacityDetailsProps {
  satellites: SatelliteData[];
  selectedPoint: { lat: number; lng: number; altitude?: number } | null;
  onNavigateToLoc?: (lat: number, lng: number, height: number) => void;
  selectedSatellite: SatelliteData | null;
  autoSelectedLEOSatellite: SatelliteData | null;
  autoSelectedGEOSatellite: SatelliteData | null;
  satelliteScope: SatelliteScope;
  onMetricsChange?: (metrics: MobileAnalysisMetrics) => void;
  onSatelliteClick?: (satellite: SatelliteData | null) => void;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  selectedSNP?: any;
  candidateCoverages?: CandidateCoverage[];
  selectedCoverage?: CandidateCoverage | null;
  onSelectCoverage?: (coverage: CandidateCoverage) => void;
  selectedGeoMission?: string | null;
  selectedGeoCoverageName?: string | null;
  selectedGeoBeamId?: string | null;
  onSelectGeoMission?: (mission: string | null) => void;
  onSelectGeoCoverage?: (coverageName: string | null) => void;
  onSelectGeoBeam?: (beamId: string | null) => void;
  onSnpClick?: (snpName: string) => void;
}

interface LatencyBreakdownCardProps {
  accentColor: string;
  summary: string;
  title?: string;
  tooltip?: string;
  children: ReactNode;
}

const LatencyBreakdownCard = ({ accentColor, summary, title = 'Latency breakdown', tooltip, children }: LatencyBreakdownCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <h4 className="text-sm font-semibold flex items-center" style={{ color: accentColor }}>{title}{tooltip && <SectionTooltip content={tooltip} />}</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{summary}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 px-4 py-4 dark:border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
};

// Performance optimization: Memoize component to prevent unnecessary re-renders
const CapacityDetails = memo<CapacityDetailsProps>(({ satellites, selectedPoint, selectedSatellite, autoSelectedLEOSatellite, satelliteScope, onMetricsChange, onSatelliteClick, analysisSource, aircraftCallsign, selectedSNP: propSelectedSNP, candidateCoverages = [], selectedCoverage = null, onSelectCoverage, selectedGeoMission, selectedGeoCoverageName, selectedGeoBeamId, onSelectGeoMission, onSelectGeoCoverage, onSelectGeoBeam, onSnpClick }) => {
  // Feature 1+2+3: read simulation context for failedSnps, corridorDcLevels, hsBeamsSet
  const {
    failedSnps,
    corridorDcLevels, setCorridorDcLevel, resetCorridorDcLevels,
    beamHealthFactors,
    hsBeamsSet,
    weatherCondition: ctxWeather,
  } = useSimulation();

  const [nearestLocation, setNearestLocation] = useState<{ city: string; country: string } | null>(null);

  const [realTimeData, setRealTimeData] = useState<RealTimeCapacityData>({
    totalCapacity: 0,
    coveredSatellites: []
  });

  // Add missing refs for ExportButton
  const globeContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);

  const [terminalType, setTerminalType] = useState<TerminalType>('fixed');
  const [previousAnalysisSource, setPreviousAnalysisSource] = useState<'earth' | 'aircraft' | undefined>(undefined);
  const [isPolarSupplyPlanOpen, setIsPolarSupplyPlanOpen] = useState(false);

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


  // ── Pillar 5: Physics-based weather attenuation ───────────────────────────
  // Maps UI weather type → real dB loss → linear power ratio
  // Clear Sky: 0 dB  | Clouds: -1.5 dB  | Rain: -5.0 dB
  const [weatherType, setWeatherType] = useState<WeatherType>('clear');
  const [autoWeatherEnabled, setAutoWeatherEnabled] = useState<boolean>(true);
  const [activeConnTab, setActiveConnTab] = useState<'LEO' | 'GEO'>(
    satelliteScope === 'GEO' ? 'GEO' : 'LEO'
  );

  // Sync active tab when scope changes
  useEffect(() => {
    if (satelliteScope === 'LEO') setActiveConnTab('LEO');
    else if (satelliteScope === 'GEO') setActiveConnTab('GEO');
  }, [satelliteScope]);

  // Force Clear Sky for aviation terminals and disable auto-weather
  useEffect(() => {
    if (terminalType === 'aviation') {
      setWeatherType('clear');
      setAutoWeatherEnabled(false);
    }
  }, [terminalType]);

  // toWeatherCondition, WEATHER_PROFILES, getWeatherFactor are module-level constants —
  // no need to redefine or wrap inside the component.

  // Calculate theoretical LEO performance metrics
  const calculateLEOPerformance = useCallback((
    userLEODistance: number,
    snpLEODistance: number,
    userLEOElevation: number,
    snpLEOElevation: number,
    userLat: number,
    userLng: number,
    satLat: number,
    satLng: number,
    estimatedRttMs: number | null
  ) => {
    // RTT now comes from the detailed LEO connectivity model (propagation + overhead).
    // Keep a propagation-only fallback for defensive safety.
    const oneWayDistanceKm = userLEODistance + snpLEODistance;
    const fallbackPropagationRttMs = (2 * oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;
    const rtt = estimatedRttMs ?? Math.max(5, fallbackPropagationRttMs);

    // 2) Throughput estimation (theoretical but realistic for a USER link)
    // IMPORTANT: satellite.capacity.maxThroughput represents a global / system capacity,
    // not what a single user terminal can achieve.
    // We therefore cap by a user-terminal-like max throughput.
    // These defaults are intentionally conservative and can be made configurable later.
    const profile = TERMINAL_PROFILES[terminalType];
    const MAX_USER_DL_Gbps = profile.maxDlGbps;
    const MAX_USER_UL_Gbps = profile.maxUlGbps;
    // Aviation terminals are above clouds, so weather factor is always 1.0
    const weatherFactor = getWeatherFactor(weatherType, terminalType === 'aviation');

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
    const weatherFactor = getWeatherFactor(weatherType, terminalType === 'aviation');

    // Not usable below 10° elevation
    if (elevationDeg < 5) {
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
      return (elevationDeg - 5) / (50 - 5);
    })();

    // Keep a small floor (prevents unrealistic 0 Mbps when link is usable)
    const performanceFactor = Math.max(0.15, elevationFactor) * weatherFactor;

    const downlinkGbps = profile.maxDlGbps * performanceFactor;
    const uplinkGbps = profile.maxUlGbps * performanceFactor;

    const stability =
      elevationDeg >= 40 ? 'High' :
        elevationDeg >= 25 ? 'Medium' :
          elevationDeg >= 5 ? 'Low' :
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

    const sat = activeLEOSat!; // activeLEOSat is always set here (null-check done above via early returns)

    // --- Beam index detection: which of the 16 beams covers the user point ---
    // Uses the exact same real Cesium beam polygons as the globe rendering (via rfConnectivity.ts).
    // hsBeamsSet ensures HS beams are excluded from connectivity.
    const connectedBeamIndex = findConnectedBeamIndex(
      activePoint,
      sat,
      JulianDate.fromDate(new Date()),
      { type: 'DB_THRESHOLD', thresholdDb: -10 },
      hsBeamsSet
    );

    // Check if we have a connected SNP (from auto-selection)
    if (!propSelectedSNP) {
      // No SNP connectivity - return satellite only
      return {
        satellite: sat,
        snp: null,
        userLEOElevation: calculateElevationAngle(activePoint, sat),
        snpLEOElevation: null,
        userLEODistance: compute3DDistanceKm(activePoint, { lat: sat.position.lat, lng: sat.position.lng, alt: sat.position.alt }),
        snpLEODistance: null,
        connectedBeamIndex
      };
    }

    // We have SNP connectivity - use the selected SNP
    const userLEOElevation = calculateElevationAngle(activePoint, sat);
    const snpLEOElevation = calculateElevationAngle({ lat: propSelectedSNP.lat, lng: propSelectedSNP.lng }, sat);

    const userLEODistance = compute3DDistanceKm(activePoint, { lat: sat.position.lat, lng: sat.position.lng, alt: sat.position.alt });
    const snpLEODistance = compute3DDistanceKm({ lat: propSelectedSNP.lat, lng: propSelectedSNP.lng }, { lat: sat.position.lat, lng: sat.position.lng, alt: sat.position.alt });

    return {
      satellite: sat,
      snp: propSelectedSNP,
      userLEOElevation,
      snpLEOElevation,
      userLEODistance,
      snpLEODistance,
      connectedBeamIndex
    };
  }, [activePoint, satellites, autoSelectedLEOSatellite, propSelectedSNP]);

  const leoGeometry = useMemo(() => {
    if (!resolvedLEOConnectivity || !resolvedLEOConnectivity.snp) return null;

    return analyzeLeoConnectivity({
      userToSatelliteDistanceKm: resolvedLEOConnectivity.userLEODistance,
      satelliteToGatewayDistanceKm: resolvedLEOConnectivity.snpLEODistance || 0,
      userToSatelliteElevationDeg: resolvedLEOConnectivity.userLEOElevation,
      gatewayToSatelliteElevationDeg: resolvedLEOConnectivity.snpLEOElevation || 0,
    });
  }, [resolvedLEOConnectivity]);

  const leoPerformance = useMemo(() => {
    if (!resolvedLEOConnectivity || !resolvedLEOConnectivity.snp || !activePoint) return null;

    return calculateLEOPerformance(
      resolvedLEOConnectivity.userLEODistance,
      resolvedLEOConnectivity.snpLEODistance || 0,
      resolvedLEOConnectivity.userLEOElevation,
      resolvedLEOConnectivity.snpLEOElevation || 0,
      activePoint.lat,
      activePoint.lng,
      resolvedLEOConnectivity.satellite.position.lat,
      resolvedLEOConnectivity.satellite.position.lng,
      leoGeometry?.rttTotalMs ?? null
    );
  }, [resolvedLEOConnectivity, activePoint, calculateLEOPerformance, leoGeometry]);

  // Get resolved GEO connectivity data for display
  const resolvedGEOConnectivity = useMemo(() => {
    if (!activePoint || satellites.length === 0) return null;

    // Only consider GEO satellites when filter is ALL or GEO
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return null;
    return computeGeoConnectivity(selectedCoverage, activePoint, satellites);
  }, [activePoint, satellites, satelliteScope, selectedCoverage]);


  // Performance optimization: Memoize SNP detection to prevent recalculation
  const selectedSNP = useMemo(() => {
    if (!selectedPoint) return null;
    return SNPS_DATA.find(snp =>
      Math.abs(snp.lat - selectedPoint.lat) < 0.01 && Math.abs(snp.lng - selectedPoint.lng) < 0.01
    ) || null;
  }, [selectedPoint]);
  const geoGeometry = resolvedGEOConnectivity?.geometry ?? null;
  const currentCorridorIndex = useMemo(
    () => getCorridorIndex(activePoint?.lng ?? 0),
    [activePoint?.lng]
  );
  const currentCorridorDcLevel = corridorDcLevels[currentCorridorIndex] ?? 16;
  const currentCorridorDcScale = getDcThroughputScale(currentCorridorDcLevel);

  const mobileLeoMetrics = useMemo(() => {
    if (!leoPerformance) return null;

    return {
      rtt: leoGeometry?.rttTotalMs ?? leoPerformance.rtt,
      downlinkGbps: leoPerformance.downlinkGbps * currentCorridorDcScale,
      uplinkGbps: leoPerformance.uplinkGbps * currentCorridorDcScale,
    };
  }, [leoGeometry, leoPerformance, currentCorridorDcScale]);

  const mobileGeoMetrics = useMemo(() => {
    if (!resolvedGEOConnectivity || !geoGeometry) return null;

    const performance = calculateGEOPerformance(geoGeometry.userToSatellite.elevationDeg);
    return {
      rtt: geoGeometry.rttTotalMs,
      downlinkGbps: performance.downlinkGbps,
      uplinkGbps: performance.uplinkGbps,
    };
  }, [resolvedGEOConnectivity, geoGeometry, calculateGEOPerformance]);

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
    if (!onMetricsChange) return;

    onMetricsChange({
      leo: mobileLeoMetrics,
      geo: mobileGeoMetrics,
      totalGbps: realTimeData.totalCapacity,
      coveredCount: realTimeData.coveredSatellites.length,
    });
  }, [
    mobileGeoMetrics,
    mobileLeoMetrics,
    onMetricsChange,
    realTimeData.coveredSatellites.length,
    realTimeData.totalCapacity,
  ]);

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
        const changed =
          prev.totalCapacity !== newRealTimeData.totalCapacity ||
          prev.coveredSatellites.length !== newRealTimeData.coveredSatellites.length;
        return changed ? newRealTimeData : prev;
      });
    };

    updateRealTimeData();
    const interval = setInterval(updateRealTimeData, 1000);
    return () => clearInterval(interval);
  // satellites intentionally omitted: the callback uses satellitesRef.current (always-fresh ref).
  // Including satellites would tear down and recreate the interval every 2 s when the worker
  // fires, preventing it from ever completing a full 1 s cycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePoint, selectedSatellite]);

  if (!selectedPoint && !selectedSatellite) {
    return (
      <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-slate-800 transition-colors duration-300">
        <p className="text-lg text-center">Click on the globe to analyze satellite capacity</p>
      </div>
    );
  }

  if (selectedSatellite) {
    return (
      <SatelliteDetails
        satellites={satellites}
        selectedSatellite={selectedSatellite}
        selectedGeoMission={selectedGeoMission}
        selectedGeoCoverageName={selectedGeoCoverageName}
        selectedGeoBeamId={selectedGeoBeamId}
        onSelectGeoMission={onSelectGeoMission}
        onSelectGeoCoverage={onSelectGeoCoverage}
        onSelectGeoBeam={onSelectGeoBeam}
        onSnpClick={onSnpClick}
      />
    );
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
              <h3 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200 flex items-center">User Terminal<SectionTooltip content="The ground equipment (antenna + modem) used to connect to the satellite network. The selected type defines maximum achievable downlink/uplink throughput. Weather attenuation is applied on top of this profile." /></h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-16">Type:</label>
                  <select
                    value={terminalType}
                    onChange={(e) => setTerminalType(e.target.value as TerminalType)}
                    className="w-56 pl-3 pr-8 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-gray-100 transition-colors"
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
                      className="w-56 pl-3 pr-8 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-gray-100 transition-colors"
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
                              key === 'light_rain' ? '☁️ ' :
                                key === 'heavy_rain' ? '🌧️ ' : '⛈️ ';
                            return `${icon}${p.label}`;
                          })()}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {terminalType === 'aviation'
                        ? '0 dB'
                        : `${WEATHER_ATTENUATION_DB[toWeatherCondition(weatherType)].toFixed(1)} dB`}
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
          {(satelliteScope === 'LEO' || satelliteScope === 'GEO' || satelliteScope === 'ALL') && (
            <div className="mb-6">
              {satelliteScope === 'ALL' && (
                <div className="flex mb-4 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveConnTab('LEO')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${activeConnTab === 'LEO' ? 'bg-pink-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${resolvedLEOConnectivity?.snp ? 'bg-green-400' : resolvedLEOConnectivity ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    LEO
                    <span className={`text-[10px] font-normal ${activeConnTab === 'LEO' ? 'text-pink-100' : 'text-gray-400 dark:text-gray-500'}`}>OneWeb</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveConnTab('GEO')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${activeConnTab === 'GEO' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${resolvedGEOConnectivity ? 'bg-green-400' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    GEO
                    <span className={`text-[10px] font-normal ${activeConnTab === 'GEO' ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>Eutelsat</span>
                  </button>
                </div>
              )}
              {(satelliteScope === 'LEO' || activeConnTab === 'LEO') && (<>
              <h3 className="text-lg font-semibold mb-1 flex items-center" style={{ color: '#db2777' }}>LEO Connectivity<SectionTooltip content="Low Earth Orbit connectivity block. Shows how the user terminal connects through the nearest OneWeb LEO satellite and its associated SNP (Satellite Network Point) backhaul gateway." /></h3>
              <div className="space-y-4">
                {/* LEO Radio Path */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 mt-1 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3 flex items-center" style={{ color: '#db2777' }}>
                    Radio Path<SectionTooltip content="End-to-end signal route: User → LEO Satellite → SNP gateway and back. Shows elevation angle, slant range, and one-way propagation delay for each segment. No SNP means no service is available." />
                  </h4>
                  {resolvedLEOConnectivity ? (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3">
                      {resolvedLEOConnectivity.snp ? (
                        <div>{analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer">{resolvedLEOConnectivity.satellite.name}</button> → {resolvedLEOConnectivity.snp.name} → <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer">{resolvedLEOConnectivity.satellite.name}</button> → {analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'}</div>
                      ) : (
                        <div>{analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer">{resolvedLEOConnectivity.satellite.name}</button> (→ No SNP connectivity)</div>
                      )}
                      {resolvedLEOConnectivity.snp ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                          <div>
                            <div>{analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → {resolvedLEOConnectivity.satellite.name}{resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}</div>
                            <div className="ml-4">→ Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}° | Distance: {resolvedLEOConnectivity.userLEODistance?.toFixed(0)} km ({(leoGeometry?.propagationBreakdownMs.userToSatellite ?? (resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)</div>
                          </div>
                          <div>
                            <div>{resolvedLEOConnectivity.snp.name} → {resolvedLEOConnectivity.satellite.name}</div>
                            <div className="ml-4">→ Elevation: {resolvedLEOConnectivity.snpLEOElevation?.toFixed(1)}° | Distance: {resolvedLEOConnectivity.snpLEODistance?.toFixed(0)} km ({(leoGeometry?.propagationBreakdownMs.satelliteToGateway ?? ((resolvedLEOConnectivity.snpLEODistance || 0) / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)</div>
                          </div>
                          <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                            <span>One-way propagation</span>
                            <span>
                              {(() => {
                                const oneWayDistanceKm = resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0);
                                const oneWayDelayMs = leoGeometry?.oneWayRadioMs ?? ((oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000);
                                return `${oneWayDistanceKm.toFixed(0)} km (${oneWayDelayMs.toFixed(1)} ms)`;
                              })()}
                            </span>
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
                <LatencyBreakdownCard
                  accentColor="#db2777"
                  tooltip="Breakdown of the full round-trip propagation delay over the LEO link: User → Satellite → SNP → Satellite → User, plus network overhead (gateway processing, modem, routing)."
                  summary={leoGeometry ? `Estimated RTT total: ${leoGeometry.rttTotalMs.toFixed(1)} ms` : 'No LEO latency breakdown available without SNP connectivity.'}
                >
                  {leoGeometry ? (
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                      <div className="font-semibold text-gray-700 dark:text-gray-200">RTT propagation components</div>
                      <div className="flex justify-between"><span>User {'->'} Satellite</span><span>{leoGeometry.propagationBreakdownMs.userToSatellite.toFixed(1)} ms</span></div>
                      <div className="flex justify-between"><span>Satellite {'->'} SNP</span><span>{leoGeometry.propagationBreakdownMs.satelliteToGateway.toFixed(1)} ms</span></div>
                      <div className="flex justify-between"><span>SNP {'->'} Satellite</span><span>{leoGeometry.propagationBreakdownMs.gatewayToSatellite.toFixed(1)} ms</span></div>
                      <div className="flex justify-between"><span>Satellite {'->'} User</span><span>{leoGeometry.propagationBreakdownMs.satelliteToUser.toFixed(1)} ms</span></div>
                      <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                        <span>RTT propagation</span><span>{leoGeometry.rttPropagationMs.toFixed(1)} ms</span>
                      </div>
                      <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead components</div>
                      <div className="ml-2 flex justify-between"><span>Gateway processing delay</span><span>{leoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms</span></div>
                      <div className="ml-2 flex justify-between"><span>Modem processing delay</span><span>{leoGeometry.overheadMs.modemProcessing.toFixed(0)} ms</span></div>
                      <div className="ml-2 flex justify-between"><span>Routing delay</span><span>{leoGeometry.overheadMs.routing.toFixed(0)} ms</span></div>
                      <div className="ml-2 flex justify-between"><span>Queueing delay</span><span>{leoGeometry.overheadMs.queueing.toFixed(0)} ms</span></div>
                      <div className="ml-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                        <span>Network overhead total</span><span>{leoGeometry.overheadMs.total.toFixed(1)} ms</span>
                      </div>
                      <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                        <span>Estimated RTT total</span><span>{leoGeometry.rttTotalMs.toFixed(1)} ms</span>
                      </div>
                      {leoGeometry.warnings.length > 0 && (
                        <div className="mt-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-amber-800 dark:text-amber-300">
                          {leoGeometry.warnings.map((warning, index) => (
                            <div key={`${warning}-${index}`}>Warning: {warning}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                      <div>No LEO latency breakdown available without SNP connectivity.</div>
                    </div>
                  )}
                </LatencyBreakdownCard>
                {/* Feature 4: Pass Beam Timeline */}
                {resolvedLEOConnectivity?.satellite && activePoint && (
                  <PassBeamTimeline
                    satellite={resolvedLEOConnectivity.satellite}
                    userPosition={activePoint}
                    failedSnps={failedSnps}
                    hsBeams={hsBeamsSet}
                    weatherCondition={ctxWeather}
                    beamHealthFactors={beamHealthFactors}
                    maxDlMbps={TERMINAL_PROFILES[terminalType].maxDlGbps * 1000}
                  />
                )}

                {/* LEO Estimated Performance (with DC scaling applied) */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3 flex items-center" style={{ color: '#db2777' }}>Estimated Performance<SectionTooltip content="Predicted downlink/uplink throughput and round-trip latency based on LEO link geometry, beam health factors, weather attenuation, and the current corridor DC level." /></h4>
                  {leoPerformance ? (
                    <PerformancePanel
                      rtt={mobileLeoMetrics?.rtt ?? null}
                      downlinkGbps={mobileLeoMetrics?.downlinkGbps ?? null}
                      uplinkGbps={mobileLeoMetrics?.uplinkGbps ?? null}
                      maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                      maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                      performanceFactor={leoPerformance.performanceFactor * currentCorridorDcScale}
                      accentColor="#db2777"
                      rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
                      rttLabel="End-to-End LEO RTT"
                    />
                  ) : resolvedLEOConnectivity ? (
                    <PerformancePanel
                      rtt={null}
                      downlinkGbps={null}
                      uplinkGbps={null}
                      maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                      maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                      accentColor="#db2777"
                      noDataMessage="No performance data available without SNP connectivity"
                    />
                  ) : (
                    <PerformancePanel
                      rtt={null}
                      downlinkGbps={null}
                      uplinkGbps={null}
                      maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                      maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                      accentColor="#db2777"
                    />
                  )}
                </div>

                {/* Feature 2: Polar Corridor DC Supply Plan */}
                {(() => {
                  const userLng = activePoint?.lng ?? 0;
                  const currentCorridor = getCorridorIndex(userLng);
                  const currentDc = corridorDcLevels[currentCorridor] ?? 16;
                  const dcScale = getDcThroughputScale(currentDc);
                  const [west, east] = getCorridorRange(currentCorridor);

                  return (
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setIsPolarSupplyPlanOpen((open) => !open)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        aria-expanded={isPolarSupplyPlanOpen}
                      >
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold flex items-center" style={{ color: '#db2777' }}>Polar Corridor Supply Plan (DC)<SectionTooltip content="Duty Cycle allocation per 20° longitude corridor for polar orbit coverage. DC1 = 6.25% throughput, DC16 = 100% (full power). Adjust per corridor to simulate satellite power management or beam congestion scenarios." /></h4>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Current corridor: {west}° → {east}° · DC{currentDc} · {Math.round(dcScale * 100)}% throughput
                          </p>
                        </div>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isPolarSupplyPlanOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isPolarSupplyPlanOpen && (
                        <div className="border-t border-gray-200 px-4 py-4 dark:border-slate-700">
                          <div className="flex items-center justify-end mb-2">
                            <button
                              type="button"
                              onClick={resetCorridorDcLevels}
                              className="text-[11px] px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                            >
                              Reset
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                            DC1 = min demand (6.25% throughput) · DC16 = full demand (100%).
                          </p>

                          <div className="flex gap-0.5 mb-1">
                            {Array.from({ length: CORRIDOR_COUNT }, (_, idx) => {
                              const dc = corridorDcLevels[idx] ?? 16;
                              const isCurrent = idx === currentCorridor;
                              const intensity = dc / 16;
                              const [w] = getCorridorRange(idx);
                              const r = Math.round(219 - (1 - intensity) * 60);
                              const g = Math.round(39 + (1 - intensity) * 30);
                              const b = Math.round(119 + (1 - intensity) * 30);
                              return (
                                <div
                                  key={idx}
                                  title={`Corridor ${w}°→${w + 20}°: DC${dc} (${Math.round(intensity * 100)}%)`}
                                  className={`flex-1 rounded-sm cursor-ns-resize flex items-center justify-center text-[8px] font-bold text-white transition-all ${
                                    isCurrent ? 'ring-2 ring-white ring-offset-1' : ''
                                  }`}
                                  style={{
                                    height: 20,
                                    backgroundColor: dc < 16 ? `rgb(${r},${g},${b})` : '#db2777',
                                    opacity: intensity * 0.6 + 0.4,
                                  }}
                                >
                                  {dc < 10 ? dc : ''}
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[11px] text-gray-600 dark:text-gray-400 w-24 shrink-0">
                              DC level (current):
                            </span>
                            <input
                              type="range"
                              min={1}
                              max={16}
                              step={1}
                              value={currentDc}
                              onChange={e => setCorridorDcLevel(currentCorridor, Number(e.target.value))}
                              className="flex-1 accent-pink-600"
                            />
                            <span className="text-[11px] font-bold text-pink-600 dark:text-pink-400 w-12 text-right">
                              DC{currentDc} ({Math.round(dcScale * 100)}%)
                            </span>
                          </div>

                          {currentDc < 16 && (
                            <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                              Power saving active in this corridor. Beam throughput is capped at {Math.round(dcScale * 100)}% of nominal.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              </>)}
              {(satelliteScope === 'GEO' || activeConnTab === 'GEO') && (<>
              <h3 className="text-lg font-semibold mb-1 flex items-center" style={{ color: '#2563eb' }}>GEO Connectivity<SectionTooltip content="Geostationary orbit connectivity block. Shows how the user terminal connects through a Eutelsat GEO satellite and its nearest eligible ground gateway." /></h3>
              {candidateCoverages.length > 0 && selectedCoverage && (
                <div className="mb-4">
                  <CoverageSelector
                    candidateCoverages={candidateCoverages}
                    selectedCoverage={selectedCoverage}
                    onSelectCoverage={(coverage) => onSelectCoverage?.(coverage)}
                  />
                </div>
              )}
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 mt-1 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3 flex items-center" style={{ color: '#2563eb' }}>Radio Path<SectionTooltip content="End-to-end signal route: User → GEO Satellite → Ground Gateway and back. Shows elevation angle, slant range, and propagation delay per segment." /></h4>
                  {resolvedGEOConnectivity && geoGeometry ? (
                    (() => {
                      const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
                      const gatewayName = geoGeometry.satelliteToGateway.gateway?.name ?? 'No eligible gateway';
                      const userToSatelliteLabel = resolvedGEOConnectivity.candidate.coverageName || resolvedGEOConnectivity.satellite.name;
                      const oneWayDistanceKm = geoGeometry.satelliteToGateway.slantRangeKm != null
                        ? geoGeometry.userToSatellite.slantRangeKm + geoGeometry.satelliteToGateway.slantRangeKm
                        : null;
                      return (
                        <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3">
                          <div>{userLabel} → <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity.satellite)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer">{resolvedGEOConnectivity.satellite.name}</button> → {gatewayName} → <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity.satellite)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer">{resolvedGEOConnectivity.satellite.name}</button> → {userLabel}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                            <div>
                              <div>{userLabel} → {userToSatelliteLabel}</div>
                              <div className="ml-4">→ Elevation: {geoGeometry.userToSatellite.elevationDeg.toFixed(1)}° | Slant Range: {geoGeometry.userToSatellite.slantRangeKm.toFixed(0)} km ({geoGeometry.userToSatellite.latencyMs.toFixed(1)} ms)</div>
                            </div>
                            <div>
                              <div>{gatewayName} → {resolvedGEOConnectivity.satellite.name}</div>
                              <div className="ml-4">→ Slant Range: {geoGeometry.satelliteToGateway.slantRangeKm != null ? `${geoGeometry.satelliteToGateway.slantRangeKm.toFixed(0)} km` : '--'} ({geoGeometry.satelliteToGateway.latencyMs != null ? `${geoGeometry.satelliteToGateway.latencyMs.toFixed(1)} ms` : '--'})</div>
                            </div>
                            <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                              <span>One-way propagation</span>
                              <span>{oneWayDistanceKm != null && geoGeometry.oneWayRadioMs != null ? `${oneWayDistanceKm.toFixed(0)} km (${geoGeometry.oneWayRadioMs.toFixed(1)} ms)` : '--'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                      <div>No GEO visibility or beam coverage.</div>
                    </div>
                  )}
                </div>
                <LatencyBreakdownCard
                  accentColor="#2563eb"
                  tooltip="Breakdown of the full round-trip propagation delay over the GEO link: User → Satellite → Gateway → Satellite → User, plus network overhead. GEO propagation alone accounts for ~480 ms due to the 35,786 km orbital altitude."
                  summary={geoGeometry ? `Estimated RTT total: ${geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms` : 'No GEO latency breakdown available.'}
                >
                  {geoGeometry ? (
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                      <div className="font-semibold text-gray-700 dark:text-gray-200">RTT propagation components</div>
                      <div className="flex justify-between"><span>User {'->'} Satellite</span><span>{geoGeometry.propagationBreakdownMs.userToSatellite?.toFixed(1) ?? '--'} ms</span></div>
                      <div className="flex justify-between"><span>Satellite {'->'} Gateway</span><span>{geoGeometry.propagationBreakdownMs.satelliteToGateway?.toFixed(1) ?? '--'} ms</span></div>
                      <div className="flex justify-between"><span>Gateway {'->'} Satellite</span><span>{geoGeometry.propagationBreakdownMs.gatewayToSatellite?.toFixed(1) ?? '--'} ms</span></div>
                      <div className="flex justify-between"><span>Satellite {'->'} User</span><span>{geoGeometry.propagationBreakdownMs.satelliteToUser?.toFixed(1) ?? '--'} ms</span></div>
                      <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                        <span>RTT propagation</span><span>{geoGeometry.rttPropagationMs?.toFixed(1) ?? '--'} ms</span>
                      </div>
                      <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead components</div>
                      <div className="ml-2 flex justify-between"><span>Gateway processing delay</span><span>{geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms</span></div>
                      <div className="ml-2 flex justify-between"><span>Modem processing delay</span><span>{geoGeometry.overheadMs.modemProcessing.toFixed(0)} ms</span></div>
                      <div className="ml-2 flex justify-between"><span>Routing delay</span><span>{geoGeometry.overheadMs.routing.toFixed(0)} ms</span></div>
                      <div className="ml-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                        <span>Network overhead total</span><span>{geoGeometry.overheadMs.total.toFixed(1)} ms</span>
                      </div>
                      <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                        <span>Estimated RTT total</span><span>{geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms</span>
                      </div>
                      {geoGeometry.warnings.length > 0 && (
                        <div className="mt-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-amber-800 dark:text-amber-300">
                          {geoGeometry.warnings.map((warning, index) => (
                            <div key={`${warning}-${index}`}>Warning: {warning}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                      <div>No GEO latency breakdown available.</div>
                    </div>
                  )}
                </LatencyBreakdownCard>
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3 flex items-center" style={{ color: '#2563eb' }}>Estimated Performance<SectionTooltip content="Predicted GEO link throughput and end-to-end RTT. Throughput degrades at low elevation angles. Note the ~600 ms RTT inherent to all GEO orbits due to the 35,786 km orbital altitude." /></h4>
                  {resolvedGEOConnectivity && geoGeometry ? (
                    (() => {
                      const performance = calculateGEOPerformance(geoGeometry.userToSatellite.elevationDeg);
                      const geoStabilityTooltip = formatGeoStabilityTooltip(
                        geoGeometry.userToSatellite.elevationDeg,
                        geoGeometry.isUserLinkUnstable
                      );
                      return (
                        <PerformancePanel
                          rtt={geoGeometry.rttTotalMs}
                          downlinkGbps={performance.downlinkGbps}
                          uplinkGbps={performance.uplinkGbps}
                          maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                          maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                          stability={geoGeometry.isUserLinkUnstable ? 'Unstable' : performance.stability}
                          performanceFactor={performance.performanceFactor}
                          accentColor="#2563eb"
                          rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
                          rttLabel="End-to-End GEO RTT"
                          stabilityTooltip={geoStabilityTooltip}
                        />
                      );
                    })()
                  ) : (
                    <PerformancePanel
                      rtt={null}
                      downlinkGbps={null}
                      uplinkGbps={null}
                      maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                      maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                      accentColor="#2563eb"
                      noDataMessage="No GEO coverage available"
                    />
                  )}
                </div>
              </div>
              </>)}
            </div>
          )}

          {false && (satelliteScope === 'GEO' || satelliteScope === 'ALL') && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-1" style={{ color: '#2563eb' }}>GEO Connectivity</h3>
              <div className="space-y-4">
                {/* GEO Radio Path */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 mt-1 border border-gray-100 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#2563eb' }}>Radio Path</h4>
                  {resolvedGEOConnectivity ? (
                    <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3">
                      <div>{analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} ↔ <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity.satellite)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer">{resolvedGEOConnectivity.satellite.name}</button></div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 text-left">
                        <div>→ Elevation: {resolvedGEOConnectivity.elevation.toFixed(1)}° | Distance: {resolvedGEOConnectivity.distance.toFixed(0)} km ({(resolvedGEOConnectivity.distance / SPEED_OF_LIGHT_RADIO_KM_S * 1000).toFixed(1)} ms)</div>
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
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#2563eb' }}>Estimated Performance</h4>
                  {resolvedGEOConnectivity ? (
                    (() => {
                      const performance = calculateGEOPerformance(resolvedGEOConnectivity.elevation);
                      return (
                        <PerformancePanel
                          rtt={resolvedGEOConnectivity.rtt}
                          downlinkGbps={performance.downlinkGbps}
                          uplinkGbps={performance.uplinkGbps}
                          maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                          maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                          stability={performance.stability}
                          performanceFactor={performance.performanceFactor}
                          accentColor="#2563eb"
                          rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
                        />
                      );
                    })()
                  ) : (
                    <PerformancePanel
                      rtt={null}
                      downlinkGbps={null}
                      uplinkGbps={null}
                      maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                      maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                      accentColor="#2563eb"
                      noDataMessage="No GEO coverage available"
                    />
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
                    (leoGeometry?.rttTotalMs ?? (resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0)) * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000) :
                    resolvedLEOConnectivity.userLEODistance * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000,
                  downlinkGbps: resolvedLEOConnectivity.snp ?
                    (leoPerformance?.downlinkGbps ?? 0) : 0,
                  uplinkGbps: resolvedLEOConnectivity.snp ?
                    (leoPerformance?.uplinkGbps ?? 0) : 0,
                  stability: resolvedLEOConnectivity.snp ?
                    (leoPerformance?.stability ?? 'Unstable') : 'Unstable',
                  distance: resolvedLEOConnectivity.userLEODistance,
                  radioPath: resolvedLEOConnectivity.snp ?
                    `${analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → ${resolvedLEOConnectivity.satellite.name} → ${resolvedLEOConnectivity.snp.name} → ${resolvedLEOConnectivity.satellite.name} → ${analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'}` :
                    `${analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User'} → ${resolvedLEOConnectivity.satellite.name} (→ No SNP connectivity)`
                } : null}
                geoData={resolvedGEOConnectivity ? {
                  name: resolvedGEOConnectivity.satellite.name,
                  elevation: geoGeometry?.userToSatellite.elevationDeg || 0,
                  rtt: geoGeometry?.rttTotalMs || 0,
                  downlinkGbps: (() => {
                    const performance = calculateGEOPerformance(geoGeometry?.userToSatellite.elevationDeg || 0);
                    return performance.downlinkGbps;
                  })(),
                  uplinkGbps: (() => {
                    const performance = calculateGEOPerformance(geoGeometry?.userToSatellite.elevationDeg || 0);
                    return performance.uplinkGbps;
                  })(),
                  stability: (() => {
                    const performance = calculateGEOPerformance(geoGeometry?.userToSatellite.elevationDeg || 0);
                    return geoGeometry?.isUserLinkUnstable ? 'Unstable' : performance.stability;
                  })(),
                  distance: geoGeometry?.userToSatellite.slantRangeKm || 0,
                  geoGatewayName: geoGeometry?.satelliteToGateway.gateway?.name || null,
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
