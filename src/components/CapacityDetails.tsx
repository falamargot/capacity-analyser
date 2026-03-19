import { useEffect, useRef, useState, useMemo, useCallback, memo, type RefObject } from 'react';
import { ensureLoaded, regulatoryLookup } from '../services/regulatoryService';
import { estimateBeamLoad } from '../utils/capacityLayer';
import { computeServiceStatus } from '../utils/serviceLayer';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';
import SatelliteDetails from './SatelliteDetails';
import { SPEED_OF_LIGHT_RADIO_KM_S, RealTimeCapacityData, calculateElevationAngle, compute3DDistanceKm } from '../utils/capacityCalculator';
import { SNPS_DATA } from './globe/GlobeConfig';
import { BEAM_LENGTH_KM, TOTAL_BEAMS, BEAM_WIDTH_KM } from '../utils/oneWebComb';
import { findConnectedBeamIndex, hasRFConnectivity } from '../utils/rfConnectivity';
import { isPointInCoverage } from '../utils/coverageCalculator';
import { getBestConnectedGateway } from '../utils/connectivityRules';
import { JulianDate } from 'cesium';
import ExportButton, { type ExportButtonPayload } from './ExportButton';
import type { CandidateCoverage, MobileAnalysisMetrics } from '../types/analysis';
import { analyzeLeoConnectivity } from '../utils/leoConnectivityModel';
import { computeGeoConnectivity } from '../utils/geoCoverageSelection';
import { useSimulation } from '../contexts/SimulationContext';
import { DEFAULT_LEO_OVERHEAD_MS } from '../utils/leoConnectivityModel';
import { buildSimulationStateSnapshot } from '../types/simulation';
import type { PDFConnectionDetails } from '../utils/pdfExport';

// ─── Extracted sub-components ─────────────────────────────────────────────────
import {
  AnalysisHeader,
  TerminalConfig,
  LEOConnectivitySection,
  GEOConnectivitySection,
  TERMINAL_PROFILES,
  WEATHER_PROFILES,
  toWeatherCondition,
  getWeatherFactor,
} from './capacity';
import type { TerminalType, WeatherType } from './capacity';

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
  compactDesktop?: boolean;
  externalHeader?: boolean;
  globeRef?: RefObject<HTMLDivElement | null>;
  cesiumViewerRef?: RefObject<any>;
  onExportStateChange?: (payload: ExportButtonPayload | null) => void;
}

const weatherTypeFromCondition = (condition: ReturnType<typeof toWeatherCondition>): WeatherType => {
  if (condition === 'CLEAR') return 'clear';
  if (condition === 'CLOUDS') return 'light_rain';
  return 'heavy_rain';
};

// Performance optimization: Memoize component to prevent unnecessary re-renders
const CapacityDetails = memo<CapacityDetailsProps>(({ satellites, selectedPoint, selectedSatellite, autoSelectedLEOSatellite, satelliteScope, onMetricsChange, onSatelliteClick, analysisSource, aircraftCallsign, selectedSNP: propSelectedSNP, candidateCoverages = [], selectedCoverage = null, onSelectCoverage, selectedGeoMission, selectedGeoCoverageName, selectedGeoBeamId, onSelectGeoMission, onSelectGeoCoverage, onSelectGeoBeam, onSnpClick, compactDesktop = false, externalHeader = false, globeRef, cesiumViewerRef, onExportStateChange }) => {
  // Feature 1+3: read simulation context for failedSnps, hsBeamsSet
  const {
    coveragePolicy,
    failedSnps,
    beamHealthFactors,
    hsBeamsSet,
    weatherCondition: ctxWeather,
    setWeatherCondition,
  } = useSimulation();
  const simulationState = useMemo(() => buildSimulationStateSnapshot({
    coveragePolicy,
    weatherCondition: ctxWeather,
    beamHealthFactors,
    hsBeams: hsBeamsSet,
  }), [beamHealthFactors, coveragePolicy, ctxWeather, hsBeamsSet]);

  // ── Regulatory + Capacity + Service layers ────────────────────────────────
  // Trigger async GeoJSON load on component mount; result feeds into useMemos below.
  const [regulatoryReady, setRegulatoryReady] = useState(false);
  useEffect(() => {
    ensureLoaded().then(() => setRegulatoryReady(true));
  }, []);

  const [nearestLocation, setNearestLocation] = useState<{ city: string; country: string } | null>(null);

  const [realTimeData, setRealTimeData] = useState<RealTimeCapacityData>({
    totalCapacity: 0,
    coveredSatellites: []
  });

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


  // ── Pillar 5: Physics-based weather attenuation ───────────────────────────
  // Maps UI weather type → real dB loss → linear power ratio
  // Clear Sky: 0 dB  | Clouds: -1.5 dB  | Rain: -5.0 dB
  const [weatherType, setWeatherType] = useState<WeatherType>(() => weatherTypeFromCondition(ctxWeather));
  const [autoWeatherEnabled, setAutoWeatherEnabled] = useState<boolean>(true);
  const [activeConnTab, setActiveConnTab] = useState<'LEO' | 'GEO'>(
    satelliteScope === 'GEO' ? 'GEO' : 'LEO'
  );

  useEffect(() => {
    if (toWeatherCondition(weatherType) === ctxWeather) return;
    setWeatherType(weatherTypeFromCondition(ctxWeather));
  }, [ctxWeather, weatherType]);

  // Sync active tab when scope changes
  useEffect(() => {
    if (satelliteScope === 'LEO') setActiveConnTab('LEO');
    else if (satelliteScope === 'GEO') setActiveConnTab('GEO');
  }, [satelliteScope]);

  // Force Clear Sky for aviation terminals and disable auto-weather
  useEffect(() => {
    if (terminalType === 'aviation') {
      setWeatherType('clear');
      setWeatherCondition('CLEAR');
      setAutoWeatherEnabled(false);
    }
  }, [terminalType, setWeatherCondition]);

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

    const profile = TERMINAL_PROFILES[terminalType];
    const MAX_USER_DL_Gbps = profile.maxDlGbps;
    const MAX_USER_UL_Gbps = profile.maxUlGbps;
    // Aviation terminals are above clouds, so weather factor is always 1.0
    const weatherFactor = getWeatherFactor(weatherType, terminalType === 'aviation');

    // Limiting link = the weaker geometry between user<->sat and snp<->sat
    const limitingElevation = Math.min(userLEOElevation, snpLEOElevation);
    const limitingDistanceKm = Math.max(userLEODistance, snpLEODistance);

    // Footprint factor
    const a = BEAM_LENGTH_KM / 2;
    const b = BEAM_WIDTH_KM / 2;
    const kmPerDegLat = 111.32;
    const lat0Rad = (satLat * Math.PI) / 180;
    const kmPerDegLng = kmPerDegLat * Math.cos(lat0Rad);
    const dxKm = (userLng - satLng) * kmPerDegLng;
    const dyKm = (userLat - satLat) * kmPerDegLat;
    const middle = (TOTAL_BEAMS - 1) / 2;

    const footprintFactor = (() => {
      let best = 0;
      for (let i = 0; i < TOTAL_BEAMS; i++) {
        const beamCenterOffsetY = (i - middle) * BEAM_WIDTH_KM;
        const x = dxKm;
        const y = dyKm - beamCenterOffsetY;
        const r2 = (x * x) / (a * a) + (y * y) / (b * b);
        let f = 0;
        if (r2 <= 1) {
          f = 1.0 - 0.5 * r2;
        } else {
          f = 0.5 * Math.exp(-(r2 - 1));
        }
        if (f > best) best = f;
      }
      return Math.max(0, Math.min(1, best));
    })();

    // Elevation factor
    const elevationFactor = (() => {
      if (limitingElevation < 15) return 0;
      if (limitingElevation >= 50) return 1;
      return (limitingElevation - 15) / (50 - 15);
    })();

    // Distance factor
    const distanceFactor = (() => {
      const goodKm = 800;
      const badKm = 2200;
      if (limitingDistanceKm <= goodKm) return 1;
      if (limitingDistanceKm >= badKm) return 0.4;
      const t = (limitingDistanceKm - goodKm) / (badKm - goodKm);
      return 1 - 0.6 * t;
    })();

    // Handover factor
    const estimateTimeToExitSec = (elevDeg: number) => {
      const x = Math.max(0, Math.min(1, elevDeg / 90));
      return 480 * Math.pow(x, 1.6);
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
    const weatherFactor = getWeatherFactor(weatherType, terminalType === 'aviation');

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

    const elevationFactor = (() => {
      if (elevationDeg >= 50) return 1;
      return (elevationDeg - 5) / (50 - 5);
    })();

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

        const current = data?.current;
        const precipitation = Number(current?.precipitation ?? 0);
        const nextType = mapPrecipToWeatherType(precipitation);

        if (!cancelled) {
          setWeatherType(nextType);
          setWeatherCondition(toWeatherCondition(nextType));
        }
      } catch {
        // If the API fails, keep the existing selection
      }
    };

    fetchWeather();

    const intervalMs = analysisSource === 'aircraft' ? 30_000 : 0;
    const interval = intervalMs > 0 ? setInterval(fetchWeather, intervalMs) : null;

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [activePoint, autoWeatherEnabled, analysisSource, setWeatherCondition]);

  // Get resolved LEO connectivity data for display
  const resolvedLEOConnectivity = useMemo(() => {
    // Only surface a LEO path when the central resolver has validated one.
    // Falling back to the nearest LEO here can manufacture a pseudo-connectivity
    // state that bypasses the actual RF/SNP eligibility rules.
    if (!activePoint || !autoSelectedLEOSatellite) return null;

    const sat = autoSelectedLEOSatellite;

    const connectedBeamIndex = findConnectedBeamIndex(
      activePoint,
      sat,
      JulianDate.fromDate(new Date()),
      simulationState
    );

    if (!propSelectedSNP) {
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
  }, [activePoint, autoSelectedLEOSatellite, propSelectedSNP, simulationState]);

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

  const hasCurrentLEORF = useMemo(() => {
    if (!activePoint || !autoSelectedLEOSatellite) return false;

    return hasRFConnectivity(
      activePoint,
      autoSelectedLEOSatellite,
      JulianDate.fromDate(new Date()),
      simulationState
    );
  }, [activePoint, autoSelectedLEOSatellite, simulationState]);

  // ── Regulatory lookup (re-evaluates when GeoJSON finishes loading) ────────
  const regulatoryResult = useMemo(() => {
    if (!activePoint) return null;
    // regulatoryReady triggers re-evaluation after async GeoJSON load
    void regulatoryReady;
    return regulatoryLookup(activePoint.lat, activePoint.lng);
  }, [activePoint, regulatoryReady]);

  // ── Capacity layer (beam load estimation) ────────────────────────────────
  const beamLoadResult = useMemo(() => {
    if (!activePoint) return null;
    const isOcean = regulatoryResult?.isOcean ?? true;
    return estimateBeamLoad(
      activePoint.lat,
      activePoint.lng,
      isOcean,
      regulatoryResult?.isoA2 ?? null,
    );
  }, [activePoint, regulatoryResult]);

  // ── Service layer (aggregated status) ────────────────────────────────────
  const serviceLayerResult = useMemo(() => {
    if (!activePoint || !regulatoryResult || !beamLoadResult) return null;
    return computeServiceStatus({
      hasRF: hasCurrentLEORF,
      hasSNP: resolvedLEOConnectivity?.snp != null,
      regulatoryResult,
      beamLoadResult,
    });
  }, [activePoint, regulatoryResult, beamLoadResult, resolvedLEOConnectivity, hasCurrentLEORF]);

  // Get resolved GEO connectivity data for display
  const resolvedGEOConnectivity = useMemo(() => {
    if (!activePoint || satellites.length === 0) return null;
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

  const mobileLeoMetrics = useMemo(() => {
    if (!leoPerformance) return null;

    return {
      rtt: leoGeometry?.rttTotalMs ?? leoPerformance.rtt,
      downlinkGbps: leoPerformance.downlinkGbps,
      uplinkGbps: leoPerformance.uplinkGbps,
    };
  }, [leoGeometry, leoPerformance]);

  const mobileGeoMetrics = useMemo(() => {
    if (!resolvedGEOConnectivity || !geoGeometry) return null;

    const performance = calculateGEOPerformance(geoGeometry.userToSatellite.elevationDeg);
    return {
      rtt: geoGeometry.rttTotalMs,
      downlinkGbps: performance.downlinkGbps,
      uplinkGbps: performance.uplinkGbps,
    };
  }, [resolvedGEOConnectivity, geoGeometry, calculateGEOPerformance]);

  const geoPerformance = useMemo(() => {
    if (!resolvedGEOConnectivity || !geoGeometry) return null;
    return calculateGEOPerformance(geoGeometry.userToSatellite.elevationDeg);
  }, [resolvedGEOConnectivity, geoGeometry, calculateGEOPerformance]);

  const leoPdfDetails = useMemo<PDFConnectionDetails | null>(() => {
    if (!resolvedLEOConnectivity) {
      return {
        radioPath: 'No valid LEO/SNP connectivity for this location.',
        emptyState: 'No valid LEO/SNP connectivity for this location.',
      };
    }

    const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
    const terminalProfile = TERMINAL_PROFILES[terminalType];

    if (!resolvedLEOConnectivity.snp) {
      return {
        radioPath: `${userLabel} -> ${resolvedLEOConnectivity.satellite.name} (-> No SNP connectivity)`,
        routeLines: [
          `${userLabel} -> ${resolvedLEOConnectivity.satellite.name}${resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}`,
          `Elevation: ${resolvedLEOConnectivity.userLEOElevation.toFixed(1)} deg | Distance: ${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km`,
        ],
        oneWayPropagation: {
          distanceKm: resolvedLEOConnectivity.userLEODistance,
          latencyMs: resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000,
        },
        performance: {
          rttLabel: 'End-to-End LEO RTT',
          rttMs: null,
          downlinkGbps: null,
          uplinkGbps: null,
          maxDlGbps: terminalProfile.maxDlGbps,
          maxUlGbps: terminalProfile.maxUlGbps,
          notes: ['No performance data is available without SNP connectivity.'],
        },
      };
    }

    const oneWayDistanceKm = resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0);
    const effectivePerformanceFactor = leoPerformance?.performanceFactor ?? null;

    return {
      radioPath: `${userLabel} -> ${resolvedLEOConnectivity.satellite.name} -> ${resolvedLEOConnectivity.snp.name} -> ${resolvedLEOConnectivity.satellite.name} -> ${userLabel}`,
      routeLines: [
        `${userLabel} -> ${resolvedLEOConnectivity.satellite.name}${resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}`,
        `Elevation: ${resolvedLEOConnectivity.userLEOElevation.toFixed(1)} deg | Distance: ${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km (${(leoGeometry?.propagationBreakdownMs.userToSatellite ?? (resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)`,
        `${resolvedLEOConnectivity.snp.name} -> ${resolvedLEOConnectivity.satellite.name}`,
        `Elevation: ${(resolvedLEOConnectivity.snpLEOElevation || 0).toFixed(1)} deg | Distance: ${(resolvedLEOConnectivity.snpLEODistance || 0).toFixed(0)} km (${(leoGeometry?.propagationBreakdownMs.satelliteToGateway ?? ((resolvedLEOConnectivity.snpLEODistance || 0) / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)`,
      ],
      oneWayPropagation: {
        distanceKm: oneWayDistanceKm,
        latencyMs: leoGeometry?.oneWayRadioMs ?? ((oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000),
      },
      latency: leoGeometry ? {
        summary: `Estimated RTT total: ${leoGeometry.rttTotalMs.toFixed(1)} ms`,
        propagationRows: [
          { label: 'User -> Satellite', value: `${leoGeometry.propagationBreakdownMs.userToSatellite.toFixed(1)} ms` },
          { label: 'Satellite -> SNP', value: `${leoGeometry.propagationBreakdownMs.satelliteToGateway.toFixed(1)} ms` },
          { label: 'SNP -> Satellite', value: `${leoGeometry.propagationBreakdownMs.gatewayToSatellite.toFixed(1)} ms` },
          { label: 'Satellite -> User', value: `${leoGeometry.propagationBreakdownMs.satelliteToUser.toFixed(1)} ms` },
        ],
        propagationTotal: `${leoGeometry.rttPropagationMs.toFixed(1)} ms`,
        overheadRows: [
          { label: 'Gateway processing delay', value: `${leoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms` },
          { label: 'Modem processing delay', value: `${leoGeometry.overheadMs.modemProcessing.toFixed(0)} ms` },
          { label: 'Routing delay', value: `${leoGeometry.overheadMs.routing.toFixed(0)} ms` },
          { label: 'Queueing delay', value: `${leoGeometry.overheadMs.queueing.toFixed(0)} ms` },
        ],
        overheadTotal: `${leoGeometry.overheadMs.total.toFixed(1)} ms`,
        total: `${leoGeometry.rttTotalMs.toFixed(1)} ms`,
        warnings: leoGeometry.warnings,
      } : null,
      performance: {
        rttLabel: 'End-to-End LEO RTT',
        rttMs: mobileLeoMetrics?.rtt ?? null,
        downlinkGbps: mobileLeoMetrics?.downlinkGbps ?? null,
        uplinkGbps: mobileLeoMetrics?.uplinkGbps ?? null,
        maxDlGbps: terminalProfile.maxDlGbps,
        maxUlGbps: terminalProfile.maxUlGbps,
        stability: leoPerformance?.stability ?? null,
        performanceFactor: effectivePerformanceFactor,
        notes: [
          leoPerformance ? `Weather profile: ${leoPerformance.weatherLabel} (${Math.round(leoPerformance.weatherFactor * 100)}% link factor)` : '',
        ].filter(Boolean),
      },
    };
  }, [
    resolvedLEOConnectivity,
    analysisSource,
    aircraftCallsign,
    terminalType,
    leoPerformance,
    leoGeometry,
    mobileLeoMetrics,
  ]);

  const geoPdfDetails = useMemo<PDFConnectionDetails | null>(() => {
    if (!resolvedGEOConnectivity || !geoGeometry) {
      return {
        radioPath: 'No GEO visibility or beam coverage.',
        emptyState: 'No GEO visibility or beam coverage.',
        performance: {
          rttLabel: 'End-to-End GEO RTT',
          rttMs: null,
          downlinkGbps: null,
          uplinkGbps: null,
          maxDlGbps: TERMINAL_PROFILES[terminalType].maxDlGbps,
          maxUlGbps: TERMINAL_PROFILES[terminalType].maxUlGbps,
          notes: ['No GEO coverage available.'],
        },
      };
    }

    const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
    const gatewayName = geoGeometry.satelliteToGateway.gateway?.name ?? 'No eligible gateway';
    const userToSatelliteLabel = resolvedGEOConnectivity.candidate.coverageName || resolvedGEOConnectivity.satellite.name;
    const oneWayDistanceKm = geoGeometry.satelliteToGateway.slantRangeKm != null
      ? geoGeometry.userToSatellite.slantRangeKm + geoGeometry.satelliteToGateway.slantRangeKm
      : null;

    return {
      radioPath: `${userLabel} -> ${resolvedGEOConnectivity.satellite.name} -> ${gatewayName} -> ${resolvedGEOConnectivity.satellite.name} -> ${userLabel}`,
      routeLines: [
        `${userLabel} -> ${userToSatelliteLabel}`,
        `Elevation: ${geoGeometry.userToSatellite.elevationDeg.toFixed(1)} deg | Slant range: ${geoGeometry.userToSatellite.slantRangeKm.toFixed(0)} km (${geoGeometry.userToSatellite.latencyMs.toFixed(1)} ms)`,
        `${gatewayName} -> ${resolvedGEOConnectivity.satellite.name}`,
        `Slant range: ${geoGeometry.satelliteToGateway.slantRangeKm != null ? `${geoGeometry.satelliteToGateway.slantRangeKm.toFixed(0)} km` : 'N/A'} (${geoGeometry.satelliteToGateway.latencyMs != null ? `${geoGeometry.satelliteToGateway.latencyMs.toFixed(1)} ms` : 'N/A'})`,
      ],
      oneWayPropagation: {
        distanceKm: oneWayDistanceKm,
        latencyMs: geoGeometry.oneWayRadioMs,
      },
      latency: {
        summary: `Estimated RTT total: ${geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms`,
        propagationRows: [
          { label: 'User -> Satellite', value: `${geoGeometry.propagationBreakdownMs.userToSatellite?.toFixed(1) ?? '--'} ms` },
          { label: 'Satellite -> Gateway', value: `${geoGeometry.propagationBreakdownMs.satelliteToGateway?.toFixed(1) ?? '--'} ms` },
          { label: 'Gateway -> Satellite', value: `${geoGeometry.propagationBreakdownMs.gatewayToSatellite?.toFixed(1) ?? '--'} ms` },
          { label: 'Satellite -> User', value: `${geoGeometry.propagationBreakdownMs.satelliteToUser?.toFixed(1) ?? '--'} ms` },
        ],
        propagationTotal: geoGeometry.rttPropagationMs != null ? `${geoGeometry.rttPropagationMs.toFixed(1)} ms` : undefined,
        overheadRows: [
          { label: 'Gateway processing delay', value: `${geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms` },
          { label: 'Modem processing delay', value: `${geoGeometry.overheadMs.modemProcessing.toFixed(0)} ms` },
          { label: 'Routing delay', value: `${geoGeometry.overheadMs.routing.toFixed(0)} ms` },
        ],
        overheadTotal: `${geoGeometry.overheadMs.total.toFixed(1)} ms`,
        total: geoGeometry.rttTotalMs != null ? `${geoGeometry.rttTotalMs.toFixed(1)} ms` : undefined,
        warnings: geoGeometry.warnings,
      },
      performance: {
        rttLabel: 'End-to-End GEO RTT',
        rttMs: geoGeometry.rttTotalMs,
        downlinkGbps: geoPerformance?.downlinkGbps ?? null,
        uplinkGbps: geoPerformance?.uplinkGbps ?? null,
        maxDlGbps: TERMINAL_PROFILES[terminalType].maxDlGbps,
        maxUlGbps: TERMINAL_PROFILES[terminalType].maxUlGbps,
        stability: geoGeometry.isUserLinkUnstable ? 'Unstable' : geoPerformance?.stability ?? null,
        performanceFactor: geoPerformance?.performanceFactor ?? null,
        notes: geoPerformance ? [`Weather profile: ${geoPerformance.weatherLabel} (${Math.round(geoPerformance.weatherFactor * 100)}% link factor)`] : [],
      },
    };
  }, [
    resolvedGEOConnectivity,
    geoGeometry,
    terminalType,
    analysisSource,
    aircraftCallsign,
    geoPerformance,
  ]);

  const satellitesRef = useRef<SatelliteData[]>(satellites);
  const activePointRef = useRef<{ lat: number; lng: number } | null>(activePoint);
  const selectedSatelliteRef = useRef<SatelliteData | null>(selectedSatellite);
  const failedSnpsRef = useRef(failedSnps);
  const simulationStateRef = useRef(simulationState);

  useEffect(() => {
    satellitesRef.current = satellites;
  }, [satellites]);

  useEffect(() => {
    activePointRef.current = activePoint;
  }, [activePoint]);

  useEffect(() => {
    selectedSatelliteRef.current = selectedSatellite;
  }, [selectedSatellite]);

  useEffect(() => {
    failedSnpsRef.current = failedSnps;
  }, [failedSnps]);

  useEffect(() => {
    simulationStateRef.current = simulationState;
  }, [simulationState]);

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

  const calculateServiceAwareRealTimeCapacity = useCallback((
    availableSatellites: SatelliteData[],
    point: { lat: number; lng: number } | null,
    focusedSatellite: SatelliteData | null,
  ): RealTimeCapacityData => {
    const currentTime = JulianDate.fromDate(new Date());
    const currentFailedSnps = failedSnpsRef.current;
    const currentSimulationState = simulationStateRef.current;

    const isServiceableAtPoint = (satellite: SatelliteData): boolean => {
      if (satellite.opsStatus !== 'operational' || !point) {
        return false;
      }

      if (satellite.orbitType === 'LEO') {
        return hasRFConnectivity(point, satellite, currentTime, currentSimulationState)
          && getBestConnectedGateway(satellite, 15, currentFailedSnps) !== null;
      }

      return isPointInCoverage(point, satellite, null).includes('user');
    };

    const getNominalCapacityGbps = (satellite: SatelliteData): number =>
      Math.max(0, satellite.capacity.maxThroughput);

    if (focusedSatellite) {
      if (focusedSatellite.opsStatus !== 'operational') {
        return {
          totalCapacity: 0,
          coveredSatellites: [],
          elevationAngle: point ? calculateElevationAngle(point, focusedSatellite) : undefined,
        };
      }

      if (!point) {
        return {
          totalCapacity: getNominalCapacityGbps(focusedSatellite),
          coveredSatellites: [focusedSatellite],
        };
      }

      const elevationAngle = calculateElevationAngle(point, focusedSatellite);
      if (!isServiceableAtPoint(focusedSatellite)) {
        return {
          totalCapacity: 0,
          coveredSatellites: [],
          elevationAngle,
        };
      }

      return {
        totalCapacity: getNominalCapacityGbps(focusedSatellite),
        coveredSatellites: [focusedSatellite],
        elevationAngle,
      };
    }

    if (!point || !availableSatellites) {
      return {
        totalCapacity: 0,
        coveredSatellites: [],
      };
    }

    const coveredSatellites = availableSatellites.filter(isServiceableAtPoint);
    const totalCapacity = coveredSatellites.reduce(
      (sum, satellite) => sum + getNominalCapacityGbps(satellite),
      0
    );

    return {
      totalCapacity,
      coveredSatellites,
    };
  }, []);

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
      const newRealTimeData = calculateServiceAwareRealTimeCapacity(
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
  }, [activePoint, calculateServiceAwareRealTimeCapacity, failedSnps, selectedSatellite, simulationState]);

  const exportButtonPayload = useMemo<ExportButtonPayload | null>(() => {
    if (!activePoint) {
      return null;
    }

    const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';

    return {
      location: {
        lat: activePoint.lat,
        lng: activePoint.lng,
        name: [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ') || undefined
      },
      scope: satelliteScope,
      leoData: resolvedLEOConnectivity ? {
        name: resolvedLEOConnectivity.satellite.name,
        elevation: resolvedLEOConnectivity.userLEOElevation || 0,
        rtt: resolvedLEOConnectivity.snp
          ? (leoGeometry?.rttTotalMs ?? (resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0)) * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000)
          : resolvedLEOConnectivity.userLEODistance * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000,
        downlinkGbps: resolvedLEOConnectivity.snp
          ? (leoPerformance?.downlinkGbps ?? 0)
          : 0,
        uplinkGbps: resolvedLEOConnectivity.snp
          ? (leoPerformance?.uplinkGbps ?? 0)
          : 0,
        stability: resolvedLEOConnectivity.snp
          ? (leoPerformance?.stability ?? 'Unstable')
          : 'Unstable',
        distance: resolvedLEOConnectivity.userLEODistance,
        radioPath: resolvedLEOConnectivity.snp
          ? `${userLabel} → ${resolvedLEOConnectivity.satellite.name} → ${resolvedLEOConnectivity.snp.name} → ${resolvedLEOConnectivity.satellite.name} → ${userLabel}`
          : `${userLabel} → ${resolvedLEOConnectivity.satellite.name} (→ No SNP connectivity)`
      } : null,
      geoData: resolvedGEOConnectivity ? {
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
        radioPath: `${userLabel} → ${resolvedGEOConnectivity.satellite.name} → ${userLabel}`
      } : null,
      leoDetails: satelliteScope !== 'GEO' ? leoPdfDetails : null,
      geoDetails: satelliteScope !== 'LEO' ? geoPdfDetails : null,
      globeRef,
      cesiumViewerRef,
    };
  }, [
    activePoint,
    aircraftCallsign,
    analysisSource,
    calculateGEOPerformance,
    cesiumViewerRef,
    geoGeometry,
    geoPdfDetails,
    globeRef,
    leoGeometry,
    leoPdfDetails,
    leoPerformance,
    nearestLocation,
    resolvedGEOConnectivity,
    resolvedLEOConnectivity,
    satelliteScope,
  ]);

  useEffect(() => {
    onExportStateChange?.(exportButtonPayload);
  }, [exportButtonPayload, onExportStateChange]);

  // ─── Render ─────────────────────────────────────────────────────────────────

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
        compactDesktop={compactDesktop}
        externalHeader={externalHeader}
      />
    );
  }

  // ─── Main analysis view (USER_LOCATION_SELECTED) ───────────────────────────

  return (
    <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col transition-colors duration-300">
      <div className={`flex h-full flex-col ${compactDesktop ? 'p-3.5' : 'p-4'}`}>
        {/* Section 1: Header */}
        {!externalHeader && (
          <AnalysisHeader
            activePoint={activePoint}
            selectedSNP={selectedSNP}
            analysisSource={analysisSource}
            aircraftCallsign={aircraftCallsign}
            nearestLocation={nearestLocation}
            compact={compactDesktop}
          />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Section 2: Terminal Configuration */}
          <TerminalConfig
            terminalType={terminalType}
            onTerminalTypeChange={setTerminalType}
            weatherType={weatherType}
            onWeatherTypeChange={(wt) => {
              setWeatherType(wt);
              setWeatherCondition(toWeatherCondition(wt));
              setAutoWeatherEnabled(false);
            }}
            autoWeatherEnabled={autoWeatherEnabled}
            onAutoWeatherChange={setAutoWeatherEnabled}
            analysisSource={analysisSource}
            compact={compactDesktop}
          />

          {/* Section 3: Constellation-based Connectivity */}
          {(satelliteScope === 'LEO' || satelliteScope === 'GEO' || satelliteScope === 'ALL') && (
            <div className="mb-6">
              {/* Tab buttons (only when scope is ALL) */}
              {satelliteScope === 'ALL' && (
                <div className={`mb-4 flex rounded-xl bg-gray-100 p-1 dark:bg-slate-800 ${compactDesktop ? 'gap-1' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setActiveConnTab('LEO')}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 ${compactDesktop ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${activeConnTab === 'LEO' ? 'bg-pink-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${resolvedLEOConnectivity?.snp ? 'bg-green-400' : resolvedLEOConnectivity ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    LEO
                    <span className={`${compactDesktop ? 'text-[9px]' : 'text-[10px]'} font-normal ${activeConnTab === 'LEO' ? 'text-pink-100' : 'text-gray-400 dark:text-gray-500'}`}>OneWeb</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveConnTab('GEO')}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 ${compactDesktop ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${activeConnTab === 'GEO' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${resolvedGEOConnectivity ? 'bg-green-400' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    GEO
                    <span className={`${compactDesktop ? 'text-[9px]' : 'text-[10px]'} font-normal ${activeConnTab === 'GEO' ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>Eutelsat</span>
                  </button>
                </div>
              )}

              {/* LEO Connectivity */}
              {(satelliteScope === 'LEO' || activeConnTab === 'LEO') && (
                <LEOConnectivitySection
                  resolvedLEOConnectivity={resolvedLEOConnectivity}
                  leoGeometry={leoGeometry}
                  leoPerformance={leoPerformance}
                  mobileLeoMetrics={mobileLeoMetrics}
                  activePoint={activePoint}
                  terminalType={terminalType}
                  analysisSource={analysisSource}
                  aircraftCallsign={aircraftCallsign}
                  onSatelliteClick={onSatelliteClick}
                  failedSnps={failedSnps}
                  hsBeamsSet={hsBeamsSet}
                  weatherCondition={ctxWeather}
                  beamHealthFactors={beamHealthFactors}
                  regulatoryResult={regulatoryResult}
                  beamLoadResult={beamLoadResult}
                  serviceLayerResult={serviceLayerResult}
                />
              )}

              {/* GEO Connectivity */}
              {(satelliteScope === 'GEO' || activeConnTab === 'GEO') && (
                <GEOConnectivitySection
                  resolvedGEOConnectivity={resolvedGEOConnectivity}
                  geoGeometry={geoGeometry}
                  calculateGEOPerformance={calculateGEOPerformance}
                  terminalType={terminalType}
                  candidateCoverages={candidateCoverages}
                  selectedCoverage={selectedCoverage}
                  onSelectCoverage={onSelectCoverage}
                  analysisSource={analysisSource}
                  aircraftCallsign={aircraftCallsign}
                  onSatelliteClick={onSatelliteClick}
                />
              )}
            </div>
          )}

          {/* Section 4: Export PDF Button */}
          {exportButtonPayload && (
            <div className="mb-4">
              <ExportButton {...exportButtonPayload} />
            </div>
          )}

          {/* Section 5: Footer Statistics */}
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
