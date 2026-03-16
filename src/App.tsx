import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MapViewSwitcher from './components/MapViewSwitcher';
import SatelliteSelector from './components/SatelliteSelector';
import SplashScreen from './components/SplashScreen';
import AircraftSelector from './components/AircraftSelector';
import VesselSelector from './components/VesselSelector';
import SatelliteScopeFilter, { SatelliteScope } from './components/SatelliteScopeFilter';
import { Keyboard, MapPin, Plane, Radio, Search, Satellite, Ship, Waypoints, X } from 'lucide-react';
import { ThemeSelector } from './components/ThemeSelector';
import BottomSheet from './components/layout/BottomSheet';
import MobileAnalysisSummary from './components/layout/MobileAnalysisSummary';
import SidebarHeroCard from './components/layout/SidebarHeroCard';
import BeamLegend from './components/cesium-globe/BeamLegend';
import SatelliteStatusLegend from './components/cesium-globe/SatelliteStatusLegend';
import SimulationSettings from './components/layout/SimulationSettings';
import { fetchSatellites } from './services/satelliteService';
import { SatelliteData } from './types/satellites';
import type { CandidateCoverage, GEOBeam, MobileAnalysisMetrics, SelectedSNP } from './types/analysis';
import { calculateCoverages, destinationPoint } from './utils/coverageCalculator';
import { footprintRadiusKm, BACKHAUL_ELEVATION_DEG } from './utils/leoFootprint';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { GEO_GATEWAYS, SNPS_DATA, type GeoGatewayData, type SNPData } from './components/globe/GlobeConfig';

import { resolveAutoSelectedSatellites } from './utils/satelliteResolution';
import {
  findCandidateCoverages,
  getCandidateCoverageKey,
  getCoverageBeamId,
  getCoverageGroupId,
  getCoverageMissionName,
  getFeatureBeamCoverageKey,
  rankCandidateCoverages,
  resolveCoverageSelection,
} from './utils/geoCoverageSelection';
import { JulianDate } from 'cesium';
import { useAirTraffic, useAirTrafficInterpolation } from './modules/airTraffic';
import { Aircraft } from './modules/airTraffic/airTrafficService';
import { useMaritimeTraffic, useMaritimeTrafficInterpolation } from './modules/maritimeTraffic';
import { Vessel } from './modules/maritimeTraffic/maritimeTrafficService';
import { useSimulation } from './contexts/SimulationContext';
import { getNearestSNPInBackhaul, getSatellitesConnectedToSNP, type SNPConnectedSatellite } from './services/coverageService';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { formatCoordinates } from './utils/formatters';
import { buildSimulationStateSnapshot } from './types/simulation';

const CapacityDetails = lazy(() => import('./components/CapacityDetails'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const GatewayDetails = lazy(() => import('./components/GatewayDetails'));
const SNPDetails = lazy(() => import('./components/SNPDetails'));

// ─── Module-level constants ───────────────────────────────────────────────────
// GEO satellites move ~0.008°/2 s — below this threshold → reuse the same object
// reference so downstream useMemos don't invalidate every tick.
// LEO satellites move ~0.13°/2 s — always above threshold → always a new object.
const POSITION_EPSILON_DEG = 0.01;
const ALTITUDE_EPSILON_KM = 0.5;

// Analyzis position for earth-click or aircraft selection
interface AnalyzisPosition {
  lat: number;
  lng: number;
  altitude?: number;
  source: 'earth' | 'aircraft';
  aircraftCallsign?: string;
}

const App: React.FC = () => {
  const { coveragePolicy, failedSnps, beamHealthFactors, hsBeamsSet, weatherCondition } = useSimulation();
  const [searchQuery, setSearchQuery] = useState('');
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1100 : false);
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 920 : false);
  const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number; altitude?: number } | null>(null);
  const [analyzisPosition, setAnalyzisPosition] = useState<AnalyzisPosition | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteData | null>(null);
  const [autoSelectedLEOId, setAutoSelectedLEOId] = useState<string | null>(null);
  const [autoSelectedGEOId, setAutoSelectedGEOId] = useState<string | null>(null);
  const [selectedSNP, setSelectedSNP] = useState<SelectedSNP>(null);
  const [inspectedSNP, setInspectedSNP] = useState<SNPData | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<GeoGatewayData | null>(null);
  const [candidateCoverages, setCandidateCoverages] = useState<CandidateCoverage[]>([]);
  const [selectedCoverage, setSelectedCoverage] = useState<CandidateCoverage | null>(null);
  const [selectedGeoMission, setSelectedGeoMission] = useState<string | null>(null);
  const [selectedGeoCoverageName, setSelectedGeoCoverageName] = useState<string | null>(null);
  const [selectedGeoBeamId, setSelectedGeoBeamId] = useState<string | null>(null);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [hoveredSatelliteId, setHoveredSatelliteId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [satelliteScope, setSatelliteScope] = useState<SatelliteScope>('ALL');
  const [airTrafficEnabled, setAirTrafficEnabled] = useState(false);
  const [maritimeTrafficEnabled, setMaritimeTrafficEnabled] = useState(false);
  const [showSatelliteTrajectory, setShowSatelliteTrajectory] = useState(false);
  const commandPaletteSearchRef = useRef<HTMLInputElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const targetSourcesMenuRef = useRef<HTMLDivElement>(null);
  const [sizeScale, setSizeScale] = useState<number>(() => {
    // Return a previously saved preference if available
    const saved = parseFloat(localStorage.getItem('globeSizeScale') ?? '');
   // if (Number.isFinite(saved) && saved > 0) return saved;

    // No saved preference — derive an initial guess from screen characteristics.
    //
    // Goal: icons that appear physically comparable across different screens.
    //
    // What we know reliably in JS:
    //   • window.screen.width/height — CSS px dimensions of the display
    //     (browsers report CSS pixels, already accounting for OS display scaling)
    //   • window.devicePixelRatio — physical pixels per CSS px
    //     (handled elsewhere via Cesium resolutionScale + DPR_FACTOR)
    //
    // Heuristic: use the CSS-pixel diagonal of the screen, normalised against a
    // 1920×1080 reference (standard Full HD at 100 % OS scaling).
    // Smaller screens → their diagonal is shorter → we scale icons UP so they
    // remain proportionally visible and clickable.
    //
    // Example results (unrounded):
    //   1440×900  (13" Air, DPR=1) → 2203/1698 ≈ 1.30×
    //   1536×864  (15" Win, DPR=1.25 "125 %") → 2203/1791 ≈ 1.23×
    //   1920×1080 (15" Win, DPR=1   "100 %") → 1.00×   ← reference
    //   2560×1440 (27" 1440p, DPR=1) → 2203/2935 ≈ 0.75×
    //
    // Clamped to [0.5, 2.5] and rounded to the nearest slider step (0.25).
    const refDiag = Math.sqrt(1024 ** 2 + 768 ** 2); // ≈ 1228 CSS px
    const screenDiag = Math.sqrt(window.screen.width ** 2 + window.screen.height ** 2); // CSS pixels
    const raw = Math.max(screenDiag, 1) / refDiag;
    const clamped = Math.max(0.5, Math.min(8, raw));
    return Math.round(clamped / 0.25) * 0.25; // snap to slider step
  });
  const [splashDone, setSplashDone] = useState(false);
  const [mobileSheetSnap, setMobileSheetSnap] = useState<0 | 1 | 2>(0);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTargetSourcesMenuOpen, setIsTargetSourcesMenuOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [mobileMetrics, setMobileMetrics] = useState<MobileAnalysisMetrics>({
    leo: null,
    geo: null,
    totalGbps: 0,
    coveredCount: 0,
  });
  const viewerRef = useRef<any>(null);
  const globeContainerRef = useRef<HTMLDivElement>(null);
  const panelFallback = <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading analysis...</div>;

  // Store viewer reference when ready
  const handleCameraReady = useCallback((viewer: any) => {
    viewerRef.current = viewer;
  }, []);

  // Store globe container reference when ready
  const handleGlobeContainerReady = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    globeContainerRef.current = ref.current;
  }, []);

  // Performance optimization: Cache previous values to prevent unnecessary recalculations
  const prevSelectedSatelliteRef = useRef<string | null>(null);
  const prevSatellitesRef = useRef<SatelliteData[]>([]);

  // §1.2 — Stable ref for satellites used inside updateAnalyzisPosition,
  // avoiding recreation of the callback every 2 s when satellites changes.
  const satellitesForResolutionRef = useRef<SatelliteData[]>(satellites);

  const satelliteUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Worker-based position update refs — avoids stale closures in the onmessage handler.
  const workerRef = useRef<Worker | null>(null);
  const workerBusyRef = useRef(false);
  const selectedSatelliteIdRef = useRef<string | null>(null);
  const hoveredSatelliteIdRef = useRef<string | null>(null);

  // Helper functions (isPointInGEOCoverage, isPointInPolygon) are now centralized in utils/geoUtils.ts
  // resolveAutoSelectedSatellites is centralized in utils/satelliteResolution.ts

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1100);
      setIsPhone(window.innerWidth < 920);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isPhone && isFullscreen) {
      setIsFullscreen(false);
    }
  }, [isPhone, isFullscreen]);

  useEffect(() => {
    if (!isMobile) return;
    if (isFullscreen) return;

    const hasSelection = !!(selectedPosition || analyzisPosition || selectedSatellite || selectedAircraft || selectedGateway);
    if (!hasSelection) {
      setMobileSheetSnap(0);
    }
  }, [
    isMobile,
    isFullscreen,
    selectedPosition,
    analyzisPosition,
    selectedSatellite,
    selectedAircraft,
    selectedGateway,
  ]);

  useEffect(() => {
    const loadSatellites = async () => {
      try {
        const data = await fetchSatellites();
        setSatellites(data);
      } catch (error) {
        console.error('Error loading satellites:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSatellites();
    const interval = setInterval(loadSatellites, 3600000);
    return () => clearInterval(interval);
  }, []);

  // §1.2 — Keep the resolution ref in sync without triggering other effects
  useEffect(() => {
    satellitesForResolutionRef.current = satellites;
  }, [satellites]);

  // ─── Worker-based satellite position updates ───────────────────────────────
  //
  // SGP4 propagation for 600+ satellites (~60 ms/tick) runs inside a Web Worker
  // so the main thread is never blocked for position math.
  //
  // Design:
  //   • Worker init effect (deps []) — creates the worker once, defines scheduleTick,
  //     attaches onmessage, starts the first tick.
  //   • Responsive refs effect — keeps selection/hover refs current without forcing
  //     extra worker activity on every hover transition.
  //   • Selection effect (deps [selectedSatellite?.id]) — fires an immediate tick for
  //     manual satellite inspection, where instant ONEWEB coverage refresh matters.

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('./workers/satellitePositionWorker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch {
      return; // Web Workers not supported — positions won't update
    }

    workerRef.current = worker;

    const scheduleTick = () => {
      if (workerBusyRef.current) return;
      const sats = satellitesForResolutionRef.current;
      if (sats.length === 0) {
        // Satellites not loaded yet — retry shortly
        satelliteUpdateTimeoutRef.current = setTimeout(scheduleTick, 500);
        return;
      }
      workerBusyRef.current = true;
      worker.postMessage({
        satellites: sats.map((sat) => ({ id: sat.id, satrec: sat.satrec })),
        timestamp: Date.now(),
      });
    };

    worker.onmessage = (event: MessageEvent) => {
      workerBusyRef.current = false;

      const { positions } = event.data as {
        positions: Array<{ id: string; lat: number; lng: number; alt: number }>;
      };
      const posMap = new Map(positions.map((p) => [p.id, p]));

      // Read selection/hover from refs — avoids stale closure over React state.
      const currentSelectedId = selectedSatelliteIdRef.current;
      const currentHoveredId = hoveredSatelliteIdRef.current;

      setSatellites((currentSatellites) => {
        const selectionChanged = prevSelectedSatelliteRef.current !== currentSelectedId;
        // §1.3 — Pre-index by ID to avoid O(n²) find() calls per tick
        const prevById = new Map(prevSatellitesRef.current.map((s) => [s.id, s]));

        const updatedSatellites = currentSatellites.map((sat) => {
          const workerPos = posMap.get(sat.id);
          if (!workerPos) return sat;

          const newPosition = { lat: workerPos.lat, lng: workerPos.lng, alt: workerPos.alt };
          const prev = prevById.get(sat.id);

          const positionChanged = !prev ||
            Math.abs(prev.position.lat - newPosition.lat) > POSITION_EPSILON_DEG ||
            Math.abs(prev.position.lng - newPosition.lng) > POSITION_EPSILON_DEG ||
            Math.abs(prev.position.alt - newPosition.alt) > ALTITUDE_EPSILON_KM;

          const isSatelliteSelected = currentSelectedId === sat.id;
          const isSatelliteHovered = currentHoveredId === sat.id;
          const shouldRecalculateCoverage = sat.type === 'ONEWEB' && (
            isSatelliteSelected ||
            isSatelliteHovered ||
            selectionChanged ||
            positionChanged ||
            !sat.coverages?.length
          );

          // Nothing changed → return same reference (prevents downstream re-renders)
          if (!positionChanged && !shouldRecalculateCoverage) return sat;

          const updatedSat = positionChanged ? { ...sat, position: newPosition } : sat;
          return shouldRecalculateCoverage
            ? { ...updatedSat, coverages: calculateCoverages(updatedSat) }
            : updatedSat;
        });

        prevSelectedSatelliteRef.current = currentSelectedId;
        prevSatellitesRef.current = updatedSatellites;
        return updatedSatellites;
      });

      // Schedule next tick after state update is applied
      satelliteUpdateTimeoutRef.current = setTimeout(scheduleTick, 2000);
    };

    worker.onerror = () => {
      workerBusyRef.current = false;
      satelliteUpdateTimeoutRef.current = setTimeout(scheduleTick, 2000);
    };

    scheduleTick();

    return () => {
      if (satelliteUpdateTimeoutRef.current) clearTimeout(satelliteUpdateTimeoutRef.current);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Keep selection/hover refs current for the worker without forcing extra propagation
  // work on every hover transition.
  useEffect(() => {
    selectedSatelliteIdRef.current = selectedSatellite?.id ?? null;
    hoveredSatelliteIdRef.current = hoveredSatelliteId;
  }, [selectedSatellite?.id, hoveredSatelliteId]);

  // Fire an immediate worker tick only for explicit satellite selection changes.
  // Hover previews can safely use the normal 2 s cadence, which avoids expensive
  // worker churn while the user pans/zooms across the globe.
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || workerBusyRef.current) return;
    const sats = satellitesForResolutionRef.current;
    if (sats.length === 0) return;

    if (satelliteUpdateTimeoutRef.current) clearTimeout(satelliteUpdateTimeoutRef.current);
    workerBusyRef.current = true;
    worker.postMessage({
      satellites: sats.map((sat) => ({ id: sat.id, satrec: sat.satrec })),
      timestamp: Date.now(),
    });
  }, [selectedSatellite?.id]);

  // Filter satellites based on satellite scope
  const filteredSatellites = useMemo(() => {
    if (satelliteScope === 'ALL') {
      return satellites;
    }
    return satellites.filter(sat => sat.orbitType === satelliteScope);
  }, [satellites, satelliteScope]);

  const satelliteTypeSignature = useMemo(
    () => satellites.map((sat) => `${sat.name}:${sat.type}`).join('|'),
    [satellites]
  );

  const satelliteTypeByName = useMemo(
    () => new Map(satellites.map((sat) => [sat.name, sat.type])),
    [satelliteTypeSignature]
  );
  const simulationState = useMemo(() => buildSimulationStateSnapshot({
    coveragePolicy,
    weatherCondition,
    beamHealthFactors,
    hsBeams: hsBeamsSet,
  }), [coveragePolicy, weatherCondition, beamHealthFactors, hsBeamsSet]);

  // resolveAutoSelectedSatellites is imported from utils/satelliteResolution.ts
  // It implements the Service Availability model with:
  // - Beam-level RF connectivity validation (hasRFConnectivity)
  // - Capacity-weighted scoring (serviceQualityScore penalizes partial beam operation)
  // - Connectivity enforcement (returns null if no active beam covers the user)

  // Air traffic data fetching and filtering
  const airTraffic = useAirTraffic(
    { enabled: airTrafficEnabled },
    null, // camera bounds - will be implemented with globe integration
    selectedPosition // focus point for distance filtering
  );

  // Maritime traffic data fetching and filtering
  const maritimeTraffic = useMaritimeTraffic(
    { enabled: maritimeTrafficEnabled },
    null, // camera bounds - will be implemented with globe integration
    selectedPosition // focus point for distance filtering
  );

  // Air traffic position interpolation
  const interpolatedAircraft = useAirTrafficInterpolation(
    airTraffic.aircraft,
    airTrafficEnabled
  );

  // Maritime traffic position interpolation
  const interpolatedVessels = useMaritimeTrafficInterpolation(
    maritimeTraffic.vessels,
    maritimeTrafficEnabled
  );

  // Performance optimization: Memoize expensive coverage calculations
  // Resolve auto-selected satellites from live satellite data (never use stored objects)
  const resolvedAutoLEO = useMemo(() => {
    if (!autoSelectedLEOId) return null;
    const satellite = satellites.find(sat => sat.id === autoSelectedLEOId);
    // Additional validation: ensure satellite still exists and is valid
    return satellite || null;
  }, [satellites, autoSelectedLEOId]);

  const resolvedAutoGEO = useMemo(() => {
    if (!autoSelectedGEOId) return null;
    const satellite = satellites.find(sat => sat.id === autoSelectedGEOId);
    // Additional validation: ensure satellite still exists and is valid
    return satellite || null;
  }, [satellites, autoSelectedGEOId]);

  const resolvedSelectedGeoCoverage = useMemo(() => (
    resolveCoverageSelection(selectedCoverage, satellites)
  ), [selectedCoverage, satellites]);

  const selectedGEOBeam = useMemo<GEOBeam | null>(() => {
    if (!resolvedSelectedGeoCoverage) return null;

    return {
      feature: resolvedSelectedGeoCoverage.primaryBeam.feature,
      name: resolvedSelectedGeoCoverage.primaryBeam.name,
      type: resolvedSelectedGeoCoverage.primaryBeam.feature?.properties?.type as string | undefined,
    };
  }, [resolvedSelectedGeoCoverage]);

  const activeGeoSatellite = resolvedSelectedGeoCoverage?.satellite ?? resolvedAutoGEO;

  // Resolve live satellite instance for selected satellite (real-time positions)
  const liveSelectedSatellite = useMemo(() =>
    satellites.find(s => s.id === selectedSatellite?.id) ?? null,
    [satellites, selectedSatellite?.id]
  );

  const dedicatedSNPForSelectedLEO = useMemo(() => {
    if (!liveSelectedSatellite || liveSelectedSatellite.type !== 'ONEWEB') {
      return null;
    }

    const nearestSNP = getNearestSNPInBackhaul(liveSelectedSatellite, failedSnps);
    if (!nearestSNP) {
      return null;
    }

    return SNPS_DATA.find((snp) => snp.name === nearestSNP.name) ?? null;
  }, [liveSelectedSatellite, failedSnps]);

  const snpConnectedSatellites = useMemo((): SNPConnectedSatellite[] => {
    if (!inspectedSNP) return [];
    return getSatellitesConnectedToSNP(inspectedSNP, satellites, failedSnps);
  }, [inspectedSNP, satellites, failedSnps]);

  const syncGeoCoverageSelection = useCallback((
    position: { lat: number; lng: number } | null,
    preserveSelection: boolean
  ) => {
    if (!position || (satelliteScope !== 'ALL' && satelliteScope !== 'GEO')) {
      setCandidateCoverages([]);
      setSelectedCoverage(null);
      setAutoSelectedGEOId(null);
      return;
    }

    const geoSatellites = satellitesForResolutionRef.current.filter((sat) => sat.orbitType === 'GEO');
    const rankedCandidates = rankCandidateCoverages(
      findCandidateCoverages(position, geoSatellites)
    );

    setCandidateCoverages(rankedCandidates);
    setAutoSelectedGEOId(rankedCandidates[0]?.satelliteId ?? null);
    setSelectedCoverage((current) => {
      if (preserveSelection && current) {
        const preserved = rankedCandidates.find((candidate) => (
          getCandidateCoverageKey(candidate) === getCandidateCoverageKey(current)
        ));
        if (preserved) {
          return preserved;
        }
      }

      return rankedCandidates[0] ?? null;
    });
  }, [satelliteScope]);


  // Update coverage features based on analyzis position or manual satellite selection
  const coverageFeaturesMemo = useMemo(() => {
    const features = new Map<string, Feature<Geometry, GeoJsonProperties>>();
    const pushFeature = (feature: Feature<Geometry, GeoJsonProperties>) => {
      // Some upstream coverage records can carry a null geometry; skip them so
      // the Cesium coverage layer never crashes on malformed data.
      if (!feature.geometry) {
        return;
      }

      const key = getFeatureBeamCoverageKey(feature)
        ?? `${feature.properties?.type ?? 'feature'}::${feature.properties?.satelliteId ?? 'unknown'}::${feature.properties?.name ?? features.size}`;
      if (!features.has(key)) {
        features.set(key, feature);
      }
    };

    // Reuse the already-computed resolvedSelectedGeoCoverage (avoids a duplicate
    // O(n) satellite lookup + coverage filter inside a hot useMemo).
    const selectedGeoFeatures = resolvedSelectedGeoCoverage?.beams.map((beam) => beam.feature) ?? [];

    // If user has explicitly selected a satellite, show its coverage (Satellite Inspection mode)
    if (liveSelectedSatellite) {
      if (liveSelectedSatellite.type === 'EUTELSAT') {
        if (selectedGeoBeamId) {
          liveSelectedSatellite.coverages
            .filter((coverage) => getCoverageBeamId(coverage) === selectedGeoBeamId)
            .forEach((coverage) => pushFeature(coverage.feature));
        } else if (selectedGeoCoverageName) {
          liveSelectedSatellite.coverages
            .filter((coverage) => getCoverageGroupId(coverage) === selectedGeoCoverageName)
            .forEach((coverage) => pushFeature(coverage.feature));
        } else if (selectedGeoMission) {
          liveSelectedSatellite.coverages
            .filter((coverage) => (getCoverageMissionName(coverage) || 'Unknown mission') === selectedGeoMission)
            .forEach(c => pushFeature(c.feature));
        } else {
          liveSelectedSatellite.coverages.forEach(c => pushFeature(c.feature));
        }
      } else {
        liveSelectedSatellite.coverages.forEach(c => pushFeature(c.feature));
      }

      // Add hover effects for user interaction.
      // Use the stable ref instead of filteredSatellites so this lookup doesn't
      // add a dep that changes every 2 s on satellite position updates.
      if (hoveredSatelliteId && hoveredSatelliteId !== liveSelectedSatellite.id) {
        const hoveredSat = satellitesForResolutionRef.current.find(
          sat => sat.id === hoveredSatelliteId &&
            (satelliteScope === 'ALL' || sat.orbitType === satelliteScope)
        );
        if (hoveredSat) {
          hoveredSat.coverages.forEach(c => pushFeature(c.feature));
        }
      }

      return [...features.values()];
    }

    // Only show coverage when analyzis position is set (connectivity analyzis mode)
    if (!analyzisPosition && !selectedPosition) {
      return [...features.values()];
    }

    // Show coverage based on auto-selected satellites according to scope rules
    if (satelliteScope === 'LEO' && resolvedAutoLEO) {
      // Display LEO coverage ONLY from resolved auto-selected LEO
      resolvedAutoLEO.coverages.forEach((c: any) => pushFeature(c.feature));
    } else if (satelliteScope === 'GEO') {
      selectedGeoFeatures.forEach((feature) => pushFeature(feature));
    } else if (satelliteScope === 'ALL') {
      // Display both LEO and GEO coverage from resolved auto-selected satellites
      if (resolvedAutoLEO) {
        resolvedAutoLEO.coverages.forEach((c: any) => pushFeature(c.feature));
      }
      selectedGeoFeatures.forEach((feature) => pushFeature(feature));
    }

    // Add hover effects for user interaction (but don't change coverage display).
    // Same ref-based lookup as above — avoids the filteredSatellites dep.
    if (hoveredSatelliteId) {
      const hoveredSat = satellitesForResolutionRef.current.find(
        sat => sat.id === hoveredSatelliteId &&
          (satelliteScope === 'ALL' || sat.orbitType === satelliteScope)
      );
      if (hoveredSat) {
        hoveredSat.coverages.forEach(c => pushFeature(c.feature));
      }
    }

    return [...features.values()];
  // filteredSatellites intentionally omitted: hover lookups now use satellitesForResolutionRef
  // (always-fresh ref) so the memo no longer invalidates every 2 s just because satellite
  // positions updated. satelliteScope is kept to re-filter on scope changes.
  }, [analyzisPosition, hoveredSatelliteId, liveSelectedSatellite, resolvedAutoLEO, resolvedSelectedGeoCoverage, satelliteScope, selectedGeoBeamId, selectedGeoCoverageName, selectedGeoMission, selectedPosition]);


  // coverageFeaturesMemo is used directly - no need to copy to state

  // Handle satellite scope change with state reset
  const handleSatelliteScopeChange = useCallback((newScope: SatelliteScope) => {
    setSatelliteScope(newScope);
    setSelectedGeoMission(null);
    setSelectedGeoCoverageName(null);

    if (newScope === 'LEO') {
      setSelectedGateway(null);
    }

    // If currently selected satellite exists AND its type is NOT compatible with the new scope
    if (selectedSatellite && selectedSatellite.orbitType !== newScope && newScope !== 'ALL') {
      // Deselect the satellite
      setSelectedSatellite(null);
      // Clear any auto-selected satellite
      setAutoSelectedLEOId(null);
      setAutoSelectedGEOId(null);
      // Reset all dependent states
      setSelectedSNP(null);
      setCandidateCoverages([]);
      setSelectedCoverage(null);
      setSelectedGeoBeamId(null);
      setSelectedPosition(null);
      setAnalyzisPosition(null);
      setSelectedAircraft(null);
    }
  }, [selectedSatellite]);

  // Performance optimization: Memoize event handlers to prevent unnecessary re-renders
  const handleSatelliteClick = useCallback((satellite: SatelliteData | null) => {
    setSelectedSatellite(satellite);
    setSelectedGeoMission(null);
    setSelectedGeoCoverageName(null);
    setSelectedGeoBeamId(null);
    // Clear aircraft selection when satellite is selected
    setSelectedAircraft(null);
    setSelectedVessel(null);
    // Clear selectedPosition when satellite is selected to avoid SNP/satellite conflict
    setSelectedPosition(null);
    // Clear analyzis position when satellite is manually selected (satellite inspection mode)
    setAnalyzisPosition(null);
    setCandidateCoverages([]);
    setSelectedCoverage(null);
    // Clear selected SNP and inspected SNP when entering satellite inspection mode
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setAutoSelectedLEOId(null);
    setAutoSelectedGEOId(null);
  }, []);

  // Wrapper for UI selection (triggers FlyTo)
  const handleSatelliteSelectFromUI = useCallback((satellite: SatelliteData | null) => {
    handleSatelliteClick(satellite);
    setIsTargetSourcesMenuOpen(false);
    if (satellite && viewerRef.current) {
      // Get current camera altitude
      const currentAlt = viewerRef.current.camera.positionCartographic.height / 1000; // Convert to km

      // Calculate satellite altitude
      const satAlt = satellite.position.alt || (satellite.type === 'EUTELSAT' ? 35786 : 800);

      // Only reset altitude if satellite is higher than current camera altitude
      if (satAlt > currentAlt) {
        const targetAlt = satellite.type === 'EUTELSAT' ? 40000 : 8000;
        setCameraTarget({ lat: satellite.position.lat, lng: satellite.position.lng, alt: targetAlt });
      } else {
        // Keep current altitude, just center on satellite position
        const cartographic = viewerRef.current.camera.positionCartographic;
        setCameraTarget({
          lat: satellite.position.lat,
          lng: satellite.position.lng,
          alt: cartographic.height / 1000
        });
      }
    }
  }, [handleSatelliteClick]);

  const handleSatelliteHover = useCallback((satelliteId: string | null) => {
    setHoveredSatelliteId(satelliteId);
  }, []);

  // Performance optimization: Memoize event handlers to prevent unnecessary re-renders
  const handleSnpClick = useCallback((snpName: string | { lat: number; lng: number; name: string } | null) => {
    if (!snpName) {
      setSelectedSNP(null);
      setInspectedSNP(null);
      setSelectedGateway(null);
      setIsTargetSourcesMenuOpen(false);
      return;
    }

    if (satelliteScope === 'GEO') {
      return;
    }

    const name = typeof snpName === 'string' ? snpName : snpName.name;
    const snp = SNPS_DATA.find(s => s.name === name) ?? null;

    // Enter SNP inspection mode: clear other selections
    setInspectedSNP(snp);
    setSelectedSNP(null);
    setAnalyzisPosition(null);
    setSelectedPosition(null);
    setSelectedSatellite(null);
    setAutoSelectedLEOId(null);
    setAutoSelectedGEOId(null);
    setSelectedGeoMission(null);
    setSelectedGeoCoverageName(null);
    setSelectedGeoBeamId(null);
    setCandidateCoverages([]);
    setSelectedCoverage(null);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedGateway(null);
    setIsTargetSourcesMenuOpen(false);
  }, [satelliteScope]);

  const handleSnpSelectFromUI = useCallback((snpName: string | null) => {
    handleSnpClick(snpName);

    if (!snpName) {
      return;
    }

    const snp = SNPS_DATA.find((item) => item.name === snpName) ?? null;
    if (snp) {
      setCameraTarget({ lat: snp.lat, lng: snp.lng, alt: 8000 });
    }
  }, [handleSnpClick]);

  const handleGatewaySelect = useCallback((gateway: GeoGatewayData | null, fromComboBox: boolean = false) => {
    if (!gateway) {
      setSelectedGateway(null);
      setIsTargetSourcesMenuOpen(false);
      return;
    }

    setSelectedGateway(gateway);
    setSelectedSatellite(null);
    setAutoSelectedLEOId(null);
    setAutoSelectedGEOId(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedPosition(null);
    setAnalyzisPosition(null);
    setSelectedGeoMission(null);
    setSelectedGeoCoverageName(null);
    setSelectedGeoBeamId(null);
    setCandidateCoverages([]);
    setSelectedCoverage(null);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setIsTargetSourcesMenuOpen(false);

    if (fromComboBox) {
      setCameraTarget({ lat: gateway.lat, lng: gateway.lng, alt: 8000 });
    }
  }, []);

  const handleGatewaySelectByName = useCallback((gatewayName: string | null) => {
    if (!gatewayName) {
      setSelectedGateway(null);
      return;
    }

    const gateway = GEO_GATEWAYS.find((item) => item.name === gatewayName) ?? null;
    handleGatewaySelect(gateway, false);
  }, [handleGatewaySelect]);

  const handleAircraftHover = useCallback((_aircraft: Aircraft | null) => {
    // Aircraft hover logic - currently a no-op
  }, []);

  // SNP hover disabled — no visual feedback on hover
  const handleSnpHover = useCallback((_snpName: string | null) => {}, []);

  const handleSelectGeoMission = useCallback((mission: string | null) => {
    setSelectedGeoMission(mission);
    setSelectedGeoBeamId(null);
    if (mission) {
      setSelectedGeoCoverageName(null);
    }
  }, []);

  const handleSelectGeoCoverage = useCallback((coverageName: string | null) => {
    setSelectedGeoCoverageName(coverageName);
    setSelectedGeoBeamId(null);
    if (coverageName) {
      setSelectedGeoMission(null);
    }
  }, []);

  const handleSelectGeoBeam = useCallback((beamId: string | null) => {
    setSelectedGeoBeamId(beamId);
    if (beamId) {
      setSelectedGeoMission(null);
    }
  }, []);

  // Unified function to handle analyzis position changes (from earth click or aircraft)
  // §1.2 — satellites replaced by satellitesForResolutionRef so this callback
  // is not recreated every 2 s when satellite positions update.
  const updateAnalyzisPosition = useCallback((position: AnalyzisPosition | null) => {
    setAnalyzisPosition(position);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setSelectedGeoMission(null);
    setSelectedGeoCoverageName(null);
    setSelectedGeoBeamId(null);

    if (position) {
      setSelectedSatellite(null);

      const now = JulianDate.fromDate(new Date());
      const { autoSelectedLEOSat, autoSelectedGEOSat, selectedSNP } = resolveAutoSelectedSatellites(
        { lat: position.lat, lng: position.lng },
        satellitesForResolutionRef.current,   // stable ref — no dep needed
        satelliteScope,
        simulationState,
        now,
        failedSnps
      );

      const resolvedAutoLEOId = autoSelectedLEOSat?.id ?? null;
      const resolvedSelectedSNP = (autoSelectedLEOSat || autoSelectedGEOSat) ? selectedSNP : null;

      setAutoSelectedLEOId(resolvedAutoLEOId);
      setSelectedSNP(resolvedSelectedSNP);
      syncGeoCoverageSelection({ lat: position.lat, lng: position.lng }, false);
    } else {
      setAutoSelectedLEOId(null);
      setSelectedSNP(null);
      syncGeoCoverageSelection(null, false);
    }
  }, [failedSnps, satelliteScope, simulationState, syncGeoCoverageSelection]); // §1.2 — satellites removed from deps

  // C-03 fix: removed redundant useEffect([selectedAircraft, updateAnalyzisPosition]).
  // The interval effect below (Real-time updates for selected aircraft position) already
  // calls updateSelectedAircraftPosition() immediately on mount, so this shallow effect
  // was triggering a second resolveAutoSelectedSatellites run in <1ms on every aircraft
  // selection — doubling an expensive SGP4 beam-polygon resolution pass.
  // The interval effect handles both the initial update and subsequent 5s refreshes.

  // §1.1 — Re-resolve on explicit position/scope/policy changes.
  // satellitesForResolutionRef is used instead of satellites to remove it from the dep array.
  useEffect(() => {
    if (!analyzisPosition) return;
    const now = JulianDate.fromDate(new Date());
    const { autoSelectedLEOSat, autoSelectedGEOSat, selectedSNP: newSelectedSNP } = resolveAutoSelectedSatellites(
      { lat: analyzisPosition.lat, lng: analyzisPosition.lng },
      satellitesForResolutionRef.current,   // stable ref — not a dep
      satelliteScope,
      simulationState,
      now,
      failedSnps
    );
    setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
    setSelectedSNP(newSelectedSNP);
    syncGeoCoverageSelection({ lat: analyzisPosition.lat, lng: analyzisPosition.lng }, true);
  }, [analyzisPosition, failedSnps, satelliteScope, simulationState, syncGeoCoverageSelection]); // §1.1 — satellites removed

  // §1.3 — Periodic re-resolution for fixed positions (earth / vessel).
  //
  // Problem: LEO satellites orbit at ~7 km/s. A satellite that covered a user position
  // at T=0 may have left its beam footprint by T=60s, while a new satellite arrives from
  // the north — but the auto-selection was never re-evaluated because analyzisPosition
  // didn't change (no user interaction). The panel then shows 0 Mbps with an outdated
  // satellite still displayed, until the user clicks again.
  //
  // Fix: for source='earth' (and 'vessel'), re-run the full satellite resolution every
  // RESOLUTION_INTERVAL_MS. Aircraft positions already re-resolve via their own 5s interval
  // (updateSelectedAircraftPosition) so they are explicitly excluded here.
  //
  // Interval choice: 15s — fast enough to catch satellite transitions (~105 km orbital travel),
  // conservative enough to avoid overloading the SGP4 beam-polygon engine.
  // satellitesForResolutionRef.current always holds the latest propagated positions,
  // so there is no latency mismatch with the globe display.
  useEffect(() => {
    // Only run for static earth/vessel points — aircraft handles its own periodic update
    if (!analyzisPosition || analyzisPosition.source === 'aircraft') return;

    const RESOLUTION_INTERVAL_MS = 15_000; // 15 s — ~105 km of LEO orbital travel

    const reResolve = () => {
      // Re-read position from ref in case it was cleared between ticks
      const pos = analyzisPosition;
      if (!pos || pos.source === 'aircraft') return;

      const now = JulianDate.fromDate(new Date());
      const { autoSelectedLEOSat, autoSelectedGEOSat, selectedSNP: newSNP } = resolveAutoSelectedSatellites(
        { lat: pos.lat, lng: pos.lng },
        satellitesForResolutionRef.current,  // always-fresh satellite positions
        satelliteScope,
        simulationState,
        now,
        failedSnps
      );

      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setSelectedSNP(newSNP);
      syncGeoCoverageSelection({ lat: pos.lat, lng: pos.lng }, true);
    };

    const interval = setInterval(reResolve, RESOLUTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [analyzisPosition, failedSnps, satelliteScope, simulationState, syncGeoCoverageSelection]); // re-arm when position/scope/policy change

  // Handle geographic point click (earth-based analyzis)
  const handlePointClick = useCallback((lat: number, lng: number) => {
    const userLocation = { lat, lng };

    // Set selected position for UI compatibility
    setSelectedPosition(userLocation);

    // Clear aircraft selection when switching to earth-based analyzis
    setSelectedAircraft(null);
    setSelectedVessel(null);

    // Update unified analyzis position
    updateAnalyzisPosition({
      lat,
      lng,
      source: 'earth'
    });
  }, [updateAnalyzisPosition]);

  // Handle aircraft selection (aircraft-based analyzis)
  const handleAircraftSelect = useCallback((aircraft: Aircraft | null, fromComboBox: boolean = false) => {
    setSelectedAircraft(aircraft);
    setSelectedVessel(null);
    setIsTargetSourcesMenuOpen(false);

    if (aircraft && aircraft.latitude && aircraft.longitude) {
      // Clear earth-based position when switching to aircraft-based analyzis
      setSelectedPosition(null);

      // Update unified analyzis position with aircraft data
      updateAnalyzisPosition({
        lat: aircraft.latitude,
        lng: aircraft.longitude,
        altitude: aircraft.altitude_km || undefined,
        source: 'aircraft',
        aircraftCallsign: aircraft.callsign || undefined
      });

      // Only set camera target when selected from combobox, not from globe click
      if (fromComboBox) {
        setCameraTarget({ lat: aircraft.latitude, lng: aircraft.longitude, alt: 3000 });
      }
    } else {
      // Clear analyzis position when aircraft is deselected
      updateAnalyzisPosition(null);
    }
  }, [updateAnalyzisPosition]);

  // Handle vessel selection (vessel-based analyzis)
  const handleVesselSelect = useCallback((vessel: Vessel | null, fromComboBox: boolean = false) => {
    setSelectedVessel(vessel);
    setSelectedAircraft(null);
    setIsTargetSourcesMenuOpen(false);

    if (vessel && vessel.latitude && vessel.longitude) {
      // Clear earth-based position when switching to vessel-based analyzis
      setSelectedPosition(null);

      // Update unified analyzis position with vessel data
      updateAnalyzisPosition({
        lat: vessel.latitude,
        lng: vessel.longitude,
        altitude: 0, // Sea level
        source: 'earth' // Vessels are earth-based
      });

      // Only set camera target when selected from combobox, not from globe click
      if (fromComboBox) {
        setCameraTarget({ lat: vessel.latitude, lng: vessel.longitude, alt: 3000 });
      }
    } else {
      // Clear analyzis position when vessel is deselected
      updateAnalyzisPosition(null);
    }
  }, [updateAnalyzisPosition]);

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    const userLocation = { lat, lng };

    setSelectedPosition(userLocation);
    setCameraTarget({ lat, lng, alt: 10000 });
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setIsTargetSourcesMenuOpen(false);

    updateAnalyzisPosition({
      lat,
      lng,
      source: 'earth'
    });

    setSearchQuery('');
  }, [updateAnalyzisPosition]);

  const handleOpenCommandPalette = useCallback(() => {
    setIsSatelliteModalOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setIsHelpMenuOpen(false);
    setCommandPaletteQuery('');
    setIsCommandPaletteOpen(true);
    requestAnimationFrame(() => commandPaletteSearchRef.current?.focus());
  }, []);

  const handleCloseCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
  }, []);

  const handleDesktopTargetSearchFocus = useCallback(() => {
    setIsSatelliteModalOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const handleDesktopTargetSearchChange = useCallback((value: string) => {
    setCommandPaletteQuery(value);
    setIsSatelliteModalOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const handleToggleTargetSourcesMenu = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    setIsTargetSourcesMenuOpen((current) => !current);
  }, []);

  const handleOpenTargetSourcesMenu = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    setIsHelpMenuOpen(false);
    setIsTargetSourcesMenuOpen(true);
  }, []);

  const handleToggleHelpMenu = useCallback(() => {
    if (!isHelpMenuOpen) {
      setIsSatelliteModalOpen(false);
      setIsTargetSourcesMenuOpen(false);
      setIsCommandPaletteOpen(false);
      setCommandPaletteQuery('');
    }
    setIsHelpMenuOpen((current) => !current);
  }, [isHelpMenuOpen]);

  const handleResetView = useCallback(() => {
    setSearchQuery('');
    setSelectedPosition(null);
    setAnalyzisPosition(null);
    setCameraTarget(null);
    setSelectedSatellite(null);
    setAutoSelectedLEOId(null);
    setAutoSelectedGEOId(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setCandidateCoverages([]);
    setSelectedCoverage(null);
    setSelectedGeoMission(null);
    setSelectedGeoCoverageName(null);
    setSelectedGeoBeamId(null);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setHoveredSatelliteId(null);
    setIsFullscreen(false);
    setIsSatelliteModalOpen(false);
    setIsCommandPaletteOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setCommandPaletteQuery('');
    setIsHelpMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!isHelpMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!helpMenuRef.current?.contains(event.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isHelpMenuOpen]);

  useEffect(() => {
    if (!isTargetSourcesMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!targetSourcesMenuRef.current?.contains(event.target as Node)) {
        setIsTargetSourcesMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isTargetSourcesMenuOpen]);

  const shortcutModifier = useMemo(() => (
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'
  ), []);
  const entryPointShortcutModifier = useMemo(() => (
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'
  ), []);

  // Real-time updates for selected aircraft position and altitude
  useEffect(() => {
    if (!selectedAircraft || !airTrafficEnabled) return;

    const updateSelectedAircraftPosition = () => {
      // Find the current aircraft data from the interpolated aircraft list
      const currentAircraftData = interpolatedAircraft.find(
        aircraft => aircraft.icao24 === selectedAircraft!.icao24
      );

      if (currentAircraftData &&
        currentAircraftData.latitude &&
        currentAircraftData.longitude) {

        // Update the analyzis position with the latest interpolated aircraft data
        updateAnalyzisPosition({
          lat: currentAircraftData.latitude,
          lng: currentAircraftData.longitude,
          altitude: currentAircraftData.altitude_km || undefined,
          source: 'aircraft',
          aircraftCallsign: currentAircraftData.callsign || selectedAircraft!.callsign
        });
      }
    };

    // Update immediately
    updateSelectedAircraftPosition();

    // Set up interval for real-time updates (every 5 seconds)
    const interval = setInterval(updateSelectedAircraftPosition, 5000);

    return () => clearInterval(interval);
  }, [selectedAircraft, airTrafficEnabled, interpolatedAircraft, updateAnalyzisPosition]);

  const handleSearchInput = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
        );
        const data = await response.json();

        if (data && data[0]) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          handleLocationSelect(lat, lng);
        }
      } catch (error) {
        console.error('Error searching location:', error);
      }
    }
  }, [handleLocationSelect, searchQuery]);

  useEffect(() => {
    if (!isSatelliteModalOpen) return;
    setIsCommandPaletteOpen(false);
  }, [isSatelliteModalOpen]);

  useKeyboardShortcuts({
    onScopeChange: handleSatelliteScopeChange,
    onToggleFullscreen: () => setIsFullscreen((current) => !current),
    onToggleHelpPanel: handleToggleHelpMenu,
    onToggleEntryPointPanel: handleToggleTargetSourcesMenu,
    onResetView: handleResetView,
    enabled: !isCommandPaletteOpen,
  });

  // §4.1 — Shared props for both mobile and desktop MapViewSwitcher instances.
  // Avoids duplicating the full prop list in two places.
  const sharedMapProps = useMemo(() => ({
    satellites: filteredSatellites,
    satelliteTypeByName,
    coverageFeatures: coverageFeaturesMemo,
    onPointClick: handlePointClick,
    selectedPosition,
    onSatelliteClick: handleSatelliteClick,
    onSatelliteHover: handleSatelliteHover,
    onSnpClick: handleSnpClick,
    onGatewayClick: handleGatewaySelectByName,
    onSnpHover: handleSnpHover,
    selectedSatellite,
    autoSelectedLEOSatellite: resolvedAutoLEO,
    autoSelectedGEOSatellite: activeGeoSatellite,
    selectedGEOBeam,
    candidateCoverages,
    selectedCoverage,
    selectedGeoBeamKey: selectedSatellite && selectedGeoBeamId
      ? `${selectedSatellite.name}::${selectedGeoBeamId}`
      : null,
    selectedSNP,
    selectedGateway,
    dedicatedSNPForSelectedLEO,
    isFullscreen,
    onToggleFullscreen: () => setIsFullscreen(!isFullscreen),
    satelliteScope,
    airTrafficEnabled,
    aircraft: interpolatedAircraft,
    selectedAircraft,
    onAircraftClick: handleAircraftSelect,
    onAircraftHover: handleAircraftHover,
    maritimeTrafficEnabled,
    vessels: interpolatedVessels,
    selectedVessel,
    onVesselClick: handleVesselSelect,
    onVesselHover: undefined,
    cameraTarget,
    onCameraReady: handleCameraReady,
    onGlobeContainerReady: handleGlobeContainerReady,
    showSatelliteTrajectory,
    sizeScale,
    onToggleSatelliteTrajectory: () => setShowSatelliteTrajectory(!showSatelliteTrajectory),
    onSizeScaleChange: (v: number) => { setSizeScale(v); localStorage.setItem('globeSizeScale', String(v)); },
    inspectedSNP,
    snpConnectedSatellites,
  }), [
    filteredSatellites, satelliteTypeByName, coverageFeaturesMemo, handlePointClick, selectedPosition,
    handleSatelliteClick, handleSatelliteHover, handleSnpClick, handleGatewaySelectByName, handleSnpHover,
    selectedSatellite, resolvedAutoLEO, activeGeoSatellite, selectedGEOBeam, candidateCoverages, selectedCoverage, selectedGeoBeamId, selectedSNP, selectedGateway, dedicatedSNPForSelectedLEO,
    isFullscreen, satelliteScope, airTrafficEnabled, interpolatedAircraft,
    selectedAircraft, handleAircraftSelect, handleAircraftHover,
    maritimeTrafficEnabled, interpolatedVessels, selectedVessel, handleVesselSelect, cameraTarget,
    handleCameraReady, handleGlobeContainerReady, showSatelliteTrajectory, sizeScale,
    inspectedSNP, snpConnectedSatellites,
  ]);

  const desktopSidebarHero = useMemo(() => {
    const heroAnalysisSource = selectedAircraft ? 'aircraft' : analyzisPosition ? 'earth' : undefined;

    if (selectedSatellite) {
      const heroTone = selectedSatellite.opsStatus !== 'operational'
        ? 'satelliteInactive'
        : selectedSatellite.type === 'EUTELSAT'
          ? 'satelliteGeo'
          : 'satelliteLeo';

      return {
        eyebrow: 'Active Target',
        title: selectedSatellite.name,
        subtitle: `${selectedSatellite.orbitType} satellite inspection`,
        tone: heroTone,
        badges: [
          { label: selectedSatellite.type, tone: selectedSatellite.type === 'EUTELSAT' ? 'blue' as const : 'pink' as const },
          { label: selectedSatellite.orbitType, tone: 'slate' as const },
          { label: selectedSatellite.opsStatus === 'operational' ? 'Operational' : 'Inactive', tone: selectedSatellite.opsStatus === 'operational' ? 'emerald' as const : 'slate' as const },
        ],
      };
    }

    if (inspectedSNP) {
      return {
        eyebrow: 'Ground Segment',
        title: inspectedSNP.name,
        subtitle: `${inspectedSNP.region} ground node`,
        tone: 'snp' as const,
        badges: [
          { label: 'SNP', tone: 'amber' as const },
          { label: failedSnps.has(inspectedSNP.name) ? 'Failed' : 'Operational', tone: failedSnps.has(inspectedSNP.name) ? 'red' as const : 'emerald' as const },
        ],
      };
    }

    if (selectedGateway) {
      return {
        eyebrow: 'Ground Segment',
        title: selectedGateway.name,
        subtitle: 'GEO gateway inspection',
        tone: 'gateway' as const,
        badges: [
          { label: 'Gateway', tone: 'blue' as const },
          { label: selectedGateway.region, tone: 'slate' as const },
          { label: 'GEO', tone: 'blue' as const },
        ],
      };
    }

    if (selectedAircraft) {
      return {
        eyebrow: 'Air Traffic',
        title: selectedAircraft.callsign || selectedAircraft.icao24,
        subtitle: 'Aircraft analysis target',
        tone: 'aircraft' as const,
        badges: [
          { label: 'Aircraft', tone: 'blue' as const },
          ...(selectedAircraft.altitude_km != null ? [{ label: `${selectedAircraft.altitude_km.toFixed(1)} km`, tone: 'slate' as const }] : []),
        ],
      };
    }

    if (selectedVessel) {
      return {
        eyebrow: 'Maritime Traffic',
        title: selectedVessel.name || selectedVessel.mmsi,
        subtitle: 'Maritime analysis target',
        tone: 'vessel' as const,
        badges: [
          { label: 'Vessel', tone: 'teal' as const },
          { label: selectedVessel.vesselType.replaceAll('_', ' '), tone: 'slate' as const },
        ],
      };
    }

    const activePoint = analyzisPosition || selectedPosition;
    if (activePoint) {
      return {
        eyebrow: heroAnalysisSource === 'aircraft' ? 'Airborne Analysis' : 'Surface Analysis',
        title: formatCoordinates({ lat: activePoint.lat, lng: activePoint.lng }),
        subtitle: heroAnalysisSource === 'aircraft'
          ? `${selectedAircraft?.callsign || 'Aircraft'} corridor`
          : (activePoint.altitude ? `Altitude ${activePoint.altitude.toFixed(1)} km` : 'Ground position'),
        tone: 'position' as const,
        badges: [
          { label: heroAnalysisSource === 'aircraft' ? 'Aircraft' : 'Position', tone: 'slate' as const },
          ...(selectedSNP?.name ? [{ label: `SNP ${selectedSNP.name}`, tone: 'amber' as const }] : []),
        ],
      };
    }

    return {
      eyebrow: 'Ready',
      title: 'No active target',
      subtitle: 'Choose a satellite, aircraft, vessel or location to start the analysis.',
      tone: 'idle' as const,
      badges: [
        { label: satelliteScope, tone: 'slate' as const },
      ],
    };
  }, [
    analyzisPosition,
    failedSnps,
    inspectedSNP,
    selectedGateway,
    satelliteScope,
    selectedAircraft,
    selectedPosition,
    selectedSNP,
    selectedSatellite,
    selectedVessel,
  ]);

  if (loading || !splashDone) {
    return (
      <>
        <SplashScreen onComplete={() => setSplashDone(true)} />
        {/* Hidden pre-render so globe starts initializing behind splash */}
        {!loading && (
          <div className="opacity-0 fixed inset-0 -z-10" aria-hidden>
            <div className="min-h-screen bg-white dark:bg-slate-950" />
          </div>
        )}
      </>
    );
  }

  const entryPointCardClassName = 'group relative overflow-hidden rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.84))] p-3.5 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_-30px_rgba(37,99,235,0.28)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))]';
  const entryPointDescriptionClassName = 'mt-0.5 truncate text-[11px] leading-4 text-slate-500 dark:text-slate-400';

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 shadow-sm transition-colors duration-300">
        <div className="max-w-[1920px] mx-auto px-2 py-0 md:py-4 sm:px-4 lg:px-8">
          {isMobile ? (
            isPhone ? (
              <div className="h-14 flex items-center justify-between gap-3">
                <div className="flex items-center flex-shrink-0">
                  <Satellite className="h-6 w-6 text-blue-600" />
                </div>

                <div className="flex-1 min-w-0 flex items-center justify-center gap-2">
                  <SatelliteScopeFilter
                    currentScope={satelliteScope}
                    onScopeChange={handleSatelliteScopeChange}
                    compact={true}
                  />
                  <SimulationSettings satelliteScope={satelliteScope} />
                </div>

                <button
                  type="button"
                  onClick={() => setIsSatelliteModalOpen(true)}
                  className="flex-shrink-0 p-2 rounded-lg bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-gray-200"
                  aria-label="Open satellite selection"
                >
                  <Satellite className="h-5 w-5" />
                </button>

                <ThemeSelector isMobile />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0">
                  <Satellite className="h-7 w-7 text-blue-600 flex-shrink-0" />
                  <h1 className="ml-2 text-lg font-bold text-gray-900 dark:text-white truncate">Capacity Analyzer</h1>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-shrink-0 p-1 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex items-center gap-1">
                    <SatelliteScopeFilter
                      currentScope={satelliteScope}
                      onScopeChange={handleSatelliteScopeChange}
                    />
                    <SimulationSettings satelliteScope={satelliteScope} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSatelliteModalOpen(true)}
                    className="flex-shrink-0 p-2 rounded-lg bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-gray-200"
                    aria-label="Open entity selection"
                  >
                    <Satellite className="h-5 w-5" />
                  </button>
                  <ThemeSelector isMobile />
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between gap-6">
              <div className="flex shrink-0 items-center">
                <Satellite className="h-8 w-8 text-blue-600" />
                <h1 className="ml-2 text-2xl font-bold text-gray-900 dark:text-gray-100">ETL Capacity Analyzer</h1>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mx-auto w-full max-w-[860px]">
                  <div className="relative flex items-center rounded-[26px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-1.5 shadow-[0_24px_55px_-34px_rgba(15,23,42,0.42)] ring-1 ring-white/60 dark:border-slate-700 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.92))] dark:ring-slate-700/60">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        ref={commandPaletteSearchRef}
                        type="text"
                        value={commandPaletteQuery}
                        onFocus={handleDesktopTargetSearchFocus}
                        onChange={(event) => handleDesktopTargetSearchChange(event.target.value)}
                        placeholder="Search target or location"
                        className="h-14 w-full rounded-[20px] bg-transparent pl-14 pr-5 text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-50 dark:placeholder:text-slate-500"
                      />
                    </div>

                    <div className="mx-1 h-9 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

                    <div className="relative shrink-0" ref={targetSourcesMenuRef}>
                      <button
                        type="button"
                        onClick={handleToggleTargetSourcesMenu}
                        className={`inline-flex h-12 w-12 items-center justify-center rounded-[18px] border text-sm font-semibold shadow-sm transition-colors ${
                          isTargetSourcesMenuOpen
                            ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200'
                            : 'border-white/70 bg-white/88 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-800/88 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                        aria-expanded={isTargetSourcesMenuOpen}
                        aria-label="Open target selection"
                        title="Open target selection"
                      >
                        <Waypoints className="h-4 w-4" />
                      </button>

                      {isTargetSourcesMenuOpen && (
                        <div className="absolute right-0 top-[calc(100%+1rem)] z-[90] w-[760px] max-w-[calc(100vw-6rem)] overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_36px_90px_-42px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))]">
                          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%)]" />
                          <div className="relative border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-700">
                            <div className="text-[17px] font-semibold text-slate-950 dark:text-slate-50">
                              Choose another entry point
                            </div>
                            <div className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">
                              Jump to a satellite, gateway, location, SNP, aircraft, or vessel.
                            </div>
                          </div>

                          <div className="relative grid grid-cols-2 gap-3.5 p-4">
                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/80 to-transparent dark:via-blue-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-blue-500/15 via-sky-500/12 to-indigo-500/12 text-blue-600 dark:text-blue-300">
                                  <Satellite className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Satellite
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title="Check a satellite health and connectivity snapshot."
                                  >
                                    Health and connectivity snapshot.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2.5">
                                <SatelliteSelector
                                  satellites={satellites}
                                  onSelect={handleSatelliteSelectFromUI}
                                  selectedSatellite={selectedSatellite}
                                  satelliteScope={satelliteScope}
                                />
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent dark:via-cyan-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-cyan-500/15 via-sky-500/12 to-blue-500/12 text-cyan-600 dark:text-cyan-300">
                                  <Waypoints className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Gateway
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title={satelliteScope === 'LEO'
                                      ? 'Available only in ALL or GEO scope.'
                                      : 'Assess a GEO teleport capability.'}
                                  >
                                    {satelliteScope === 'LEO'
                                      ? 'Available only in ALL or GEO scope.'
                                      : 'Assess GEO teleport capability.'}
                                  </p>
                                </div>
                              </div>
                              <div className="relative mt-2.5">
                                <select
                                  value={selectedGateway?.name ?? ''}
                                  onChange={(event) => {
                                    const gateway = GEO_GATEWAYS.find((item) => item.name === event.target.value) ?? null;
                                    handleGatewaySelect(gateway, true);
                                  }}
                                  disabled={satelliteScope === 'LEO'}
                                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white/90 py-2 pl-4 pr-10 text-sm text-slate-900 shadow-sm focus:border-transparent focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:disabled:bg-slate-800/70 dark:disabled:text-slate-500"
                                >
                                  <option value="">{satelliteScope === 'LEO' ? 'Switch to ALL or GEO' : 'Select a gateway...'}</option>
                                  {[...GEO_GATEWAYS].sort((a, b) => a.name.localeCompare(b.name)).map((gateway) => (
                                    <option key={gateway.gateway_id} value={gateway.name}>
                                      {gateway.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent dark:via-amber-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-amber-500/15 via-orange-500/12 to-yellow-500/12 text-amber-600 dark:text-amber-300">
                                  <Radio className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    SNP
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title={satelliteScope === 'GEO'
                                      ? 'Available only in ALL or LEO scope.'
                                      : 'Inspect a service node point directly from the network map.'}
                                  >
                                    {satelliteScope === 'GEO'
                                      ? 'Available only in ALL or LEO scope.'
                                      : 'Inspect a node straight from the map.'}
                                  </p>
                                </div>
                              </div>
                              <div className="relative mt-2.5">
                                <select
                                  value={inspectedSNP?.name ?? ''}
                                  onChange={(event) => handleSnpSelectFromUI(event.target.value || null)}
                                  disabled={satelliteScope === 'GEO'}
                                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white/90 py-2 pl-4 pr-10 text-sm text-slate-900 shadow-sm focus:border-transparent focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:disabled:bg-slate-800/70 dark:disabled:text-slate-500"
                                >
                                  <option value="">{satelliteScope === 'GEO' ? 'Switch to ALL or LEO' : 'Select an SNP...'}</option>
                                  {[...SNPS_DATA].sort((a, b) => a.name.localeCompare(b.name)).map((snp) => (
                                    <option key={snp.name} value={snp.name}>
                                      {snp.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent dark:via-emerald-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-emerald-500/15 via-teal-500/12 to-cyan-500/12 text-emerald-600 dark:text-emerald-300">
                                  <MapPin className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Ground Location
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title="Search a city or an address to analyze coverage."
                                  >
                                    Search a city or address for coverage.
                                  </p>
                                </div>
                              </div>
                              <div className="relative mt-2.5">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                <form onSubmit={handleSearchInput}>
                                  <input
                                    type="text"
                                    name="search"
                                    placeholder="Search a location..."
                                    className="w-full rounded-xl border border-slate-200 bg-white/90 py-2 pl-9 pr-4 text-sm text-slate-900 shadow-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder-slate-400"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                  />
                                </form>
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent dark:via-sky-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-sky-500/15 via-blue-500/12 to-indigo-500/12 text-sky-600 dark:text-sky-300">
                                  <Plane className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Aircraft Live Feed
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title="Enable live mode to inspect active flight connectivity."
                                  >
                                    Track an active flight in live mode.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2.5">
                                <AircraftSelector
                                  aircraft={airTraffic.aircraft}
                                  selectedAircraft={selectedAircraft}
                                  onSelect={(aircraft) => handleAircraftSelect(aircraft, true)}
                                  liveModeEnabled={airTrafficEnabled}
                                  onToggleLiveMode={() => setAirTrafficEnabled(!airTrafficEnabled)}
                                />
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/80 to-transparent dark:via-teal-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-teal-500/15 via-cyan-500/12 to-emerald-500/12 text-teal-600 dark:text-teal-300">
                                  <Ship className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Vessel Live Feed
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title="Enable live mode to inspect maritime traffic connectivity."
                                  >
                                    Track maritime traffic in live mode.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2.5">
                                <VesselSelector
                                  vessels={maritimeTraffic.vessels}
                                  selectedVessel={selectedVessel}
                                  onSelect={(vessel) => handleVesselSelect(vessel, true)}
                                  liveModeEnabled={maritimeTrafficEnabled}
                                  onToggleLiveMode={() => setMaritimeTrafficEnabled(!maritimeTrafficEnabled)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <div className="flex items-center gap-2 p-1 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                  <SatelliteScopeFilter
                    currentScope={satelliteScope}
                    onScopeChange={handleSatelliteScopeChange}
                  />
                  <SimulationSettings satelliteScope={satelliteScope} />
                </div>
                <div className="flex-shrink-0">
                  <ThemeSelector />
                </div>
                <div className="relative flex-shrink-0" ref={helpMenuRef}>
                  <button
                    type="button"
                    onClick={handleToggleHelpMenu}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    aria-label="Open keyboard shortcuts help"
                    aria-expanded={isHelpMenuOpen}
                    title="Keyboard shortcuts"
                  >
                    <Keyboard className="h-5 w-5" />
                  </button>

                  {isHelpMenuOpen && (
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[90] w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_30px_70px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95">
                      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Keyboard Shortcuts
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Fast controls for navigation and search.
                        </div>
                      </div>
                      <div className="space-y-3 px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex items-center justify-between gap-4">
                          <span>Toggle scope ALL / LEO / GEO</span>
                          <span className="flex items-center gap-1">
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">1</kbd>
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">2</kbd>
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">3</kbd>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Toggle fullscreen</span>
                          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">F</kbd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Reset view</span>
                          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">Esc</kbd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Open keyboard shortcuts</span>
                          <span className="flex items-center gap-1">
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">{shortcutModifier}</kbd>
                            <span className="text-slate-400">+</span>
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">K</kbd>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Open entry point panel</span>
                          <span className="flex items-center gap-1">
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">{entryPointShortcutModifier}</kbd>
                            <span className="text-slate-400">+</span>
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">S</kbd>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {isMobile && isSatelliteModalOpen && (
        <div className="fixed inset-0 z-[60] bg-white dark:bg-slate-900">
          <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 dark:border-slate-700">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Controls</div>
            <button
              type="button"
              onClick={() => setIsSatelliteModalOpen(false)}
              className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            <SatelliteSelector
              satellites={satellites}
              onSelect={(sat) => {
                handleSatelliteSelectFromUI(sat);
                setIsSatelliteModalOpen(false);
              }}
              selectedSatellite={selectedSatellite}
              satelliteScope={satelliteScope}
            />

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <form onSubmit={handleSearchInput}>
                <input
                  type="text"
                  name="search"
                  placeholder="Search a location..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>

            <AircraftSelector
              aircraft={airTraffic.aircraft}
              selectedAircraft={selectedAircraft}
              onSelect={(aircraft) => {
                handleAircraftSelect(aircraft, true);
                setIsSatelliteModalOpen(false);
              }}
              liveModeEnabled={airTrafficEnabled}
              onToggleLiveMode={() => setAirTrafficEnabled(!airTrafficEnabled)}
            />

            <VesselSelector
              vessels={maritimeTraffic.vessels}
              selectedVessel={selectedVessel}
              onSelect={(vessel) => {
                handleVesselSelect(vessel, true);
                setIsSatelliteModalOpen(false);
              }}
              liveModeEnabled={maritimeTrafficEnabled}
              onToggleLiveMode={() => setMaritimeTrafficEnabled(!maritimeTrafficEnabled)}
            />
          </div>
        </div>
      )}

      {isMobile ? (
        <main className="px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0">
          <div className="relative h-[calc(100vh-3.5rem)] md:h-[calc(100vh-7rem)]">
            <div
              className={`absolute inset-0 bg-white overflow-hidden transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
            >
              <MapViewSwitcher {...sharedMapProps} isPhone={isPhone} />
              {satelliteScope !== 'GEO' && <BeamLegend />}
              <SatelliteStatusLegend />
            </div>


            {!isFullscreen && (selectedPosition || analyzisPosition || selectedSatellite || selectedAircraft || selectedGateway || inspectedSNP || selectedVessel) && (
              <BottomSheet
                snap={mobileSheetSnap}
                onSnapChange={setMobileSheetSnap}
                snapPoints={isPhone ? [0.18, 0.56, 0.92] : [0.2, 0.56, 0.9]}
                compact={isPhone}
                header={(
                  <MobileAnalysisSummary
                    selectedSatellite={selectedSatellite}
                    autoSelectedLEOSatellite={resolvedAutoLEO}
                    autoSelectedGEOSatellite={activeGeoSatellite}
                    compact={true}
                    metrics={mobileMetrics}
                  />
                )}
              >
                <Suspense fallback={panelFallback}>
                  {selectedGateway ? (
                    <GatewayDetails gateway={selectedGateway} satellites={satellites} />
                  ) : inspectedSNP ? (
                    <SNPDetails
                      snp={inspectedSNP}
                      connectedSatellites={snpConnectedSatellites}
                      onSatelliteClick={handleSatelliteClick}
                    />
                  ) : (
                    <CapacityDetails
                      satellites={filteredSatellites}
                      selectedPoint={analyzisPosition || selectedPosition}
                      selectedSatellite={selectedSatellite}
                      autoSelectedLEOSatellite={resolvedAutoLEO}
                      autoSelectedGEOSatellite={activeGeoSatellite}
                      satelliteScope={satelliteScope}
                      onSatelliteClick={handleSatelliteClick}
                      analysisSource={selectedAircraft ? 'aircraft' : analyzisPosition ? 'earth' : undefined}
                      aircraftCallsign={selectedAircraft?.callsign}
                      selectedSNP={selectedSNP}
                      candidateCoverages={candidateCoverages}
                      selectedCoverage={selectedCoverage}
                      onSelectCoverage={setSelectedCoverage}
                      selectedGeoMission={selectedGeoMission}
                      selectedGeoCoverageName={selectedGeoCoverageName}
                      selectedGeoBeamId={selectedGeoBeamId}
                      onSelectGeoMission={handleSelectGeoMission}
                      onSelectGeoCoverage={handleSelectGeoCoverage}
                      onSelectGeoBeam={handleSelectGeoBeam}
                      onSnpClick={handleSnpClick}
                      onMetricsChange={setMobileMetrics}
                    />
                  )}
                </Suspense>
              </BottomSheet>
            )}
          </div>
        </main>
      ) : (
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className={`flex flex-row gap-8 h-[calc(100vh-8rem)]`}>
            <div
              className={`flex-1 relative bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
            >
              <MapViewSwitcher {...sharedMapProps} isPhone={false} />
              {satelliteScope !== 'GEO' && <BeamLegend />}
              <SatelliteStatusLegend />
            </div>


            <div className={`flex-shrink-0 w-[500px] overflow-hidden rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] flex flex-col ${isFullscreen ? 'hidden' : ''}`}>
              {!isFullscreen && (
                <>
                  <SidebarHeroCard
                    eyebrow={desktopSidebarHero.eyebrow}
                    title={desktopSidebarHero.title}
                    subtitle={desktopSidebarHero.subtitle}
                    tone={desktopSidebarHero.tone}
                    badges={desktopSidebarHero.badges}
                    onReset={handleResetView}
                  />

                  <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                    <Suspense fallback={panelFallback}>
                      {selectedGateway ? (
                        <GatewayDetails
                          gateway={selectedGateway}
                          satellites={satellites}
                          externalHeader
                        />
                      ) : inspectedSNP ? (
                        <SNPDetails
                          snp={inspectedSNP}
                          connectedSatellites={snpConnectedSatellites}
                          onSatelliteClick={handleSatelliteClick}
                          externalHeader
                        />
                      ) : (
                        <CapacityDetails
                          satellites={filteredSatellites}
                          selectedPoint={analyzisPosition || selectedPosition}
                          selectedSatellite={selectedSatellite}
                          autoSelectedLEOSatellite={resolvedAutoLEO}
                          autoSelectedGEOSatellite={activeGeoSatellite}
                          satelliteScope={satelliteScope}
                          onSatelliteClick={handleSatelliteClick}
                          analysisSource={selectedAircraft ? 'aircraft' : analyzisPosition ? 'earth' : undefined}
                          aircraftCallsign={selectedAircraft?.callsign}
                          selectedSNP={selectedSNP}
                          candidateCoverages={candidateCoverages}
                          selectedCoverage={selectedCoverage}
                          onSelectCoverage={setSelectedCoverage}
                          selectedGeoMission={selectedGeoMission}
                          selectedGeoCoverageName={selectedGeoCoverageName}
                          selectedGeoBeamId={selectedGeoBeamId}
                          onSelectGeoMission={handleSelectGeoMission}
                          onSelectGeoCoverage={handleSelectGeoCoverage}
                          onSelectGeoBeam={handleSelectGeoBeam}
                          onSnpClick={handleSnpClick}
                          externalHeader
                        />
                      )}
                    </Suspense>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      )}

      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={handleCloseCommandPalette}
            satellites={satellites}
            aircraft={airTraffic.aircraft}
            vessels={maritimeTraffic.vessels}
            anchorRef={commandPaletteSearchRef}
            hideInlineSearchWhenAnchored
            resultTypes={satelliteScope === 'GEO' ? ['satellite', 'location', 'gateway'] : satelliteScope === 'LEO' ? ['satellite', 'location', 'snp'] : ['satellite', 'location', 'snp', 'gateway']}
            query={commandPaletteQuery}
            onQueryChange={setCommandPaletteQuery}
            onSelectSatellite={handleSatelliteSelectFromUI}
            onSelectAircraft={(aircraft) => handleAircraftSelect(aircraft, true)}
            onSelectVessel={(vessel) => handleVesselSelect(vessel, true)}
            onSelectSnp={(snpName) => handleSnpClick(snpName)}
            onSelectGateway={(gateway) => handleGatewaySelect(gateway, true)}
            onSelectLocation={handleLocationSelect}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
