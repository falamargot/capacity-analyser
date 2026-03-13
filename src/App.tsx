import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MapViewSwitcher from './components/MapViewSwitcher';
import CapacityDetails from './components/CapacityDetails';
import SatelliteSelector from './components/SatelliteSelector';
import SplashScreen from './components/SplashScreen';
import AircraftSelector from './components/AircraftSelector';
import VesselSelector from './components/VesselSelector';
import SatelliteScopeFilter, { SatelliteScope } from './components/SatelliteScopeFilter';
import { Search, Satellite, X } from 'lucide-react';
import { ThemeSelector } from './components/ThemeSelector';
import BottomSheet from './components/layout/BottomSheet';
import MobileAnalysisSummary from './components/layout/MobileAnalysisSummary';
import BeamLegend from './components/cesium-globe/BeamLegend';
import SimulationSettings from './components/layout/SimulationSettings';
import { fetchSatellites } from './services/satelliteService';
import { SatelliteData } from './types/satellites';
import type { CandidateCoverage, GEOBeam, SelectedSNP } from './types/analysis';
import { calculateCoverages, destinationPoint } from './utils/coverageCalculator';
import { footprintRadiusKm, BACKHAUL_ELEVATION_DEG } from './utils/leoFootprint';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { SNPS_DATA, type SNPData } from './components/globe/GlobeConfig';

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
import SNPDetails from './components/SNPDetails';

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
  const { coveragePolicy, failedSnps } = useSimulation();
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
  const [candidateCoverages, setCandidateCoverages] = useState<CandidateCoverage[]>([]);
  const [selectedCoverage, setSelectedCoverage] = useState<CandidateCoverage | null>(null);
  const [selectedGeoMission, setSelectedGeoMission] = useState<string | null>(null);
  const [selectedGeoCoverageName, setSelectedGeoCoverageName] = useState<string | null>(null);
  const [selectedGeoBeamId, setSelectedGeoBeamId] = useState<string | null>(null);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [hoveredSatelliteId, setHoveredSatelliteId] = useState<string | null>(null);
  const [hoveredSnpName, setHoveredSnpName] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [satelliteScope, setSatelliteScope] = useState<SatelliteScope>('ALL');
  const [airTrafficEnabled, setAirTrafficEnabled] = useState(false);
  const [maritimeTrafficEnabled, setMaritimeTrafficEnabled] = useState(false);
  const [showSatelliteTrajectory, setShowSatelliteTrajectory] = useState(false);
  const [sizeScale, setSizeScale] = useState(1); // 0.5, 1, 2, 4, 8
  const [splashDone, setSplashDone] = useState(false);
  const [mobileSheetSnap, setMobileSheetSnap] = useState<0 | 1 | 2>(0);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [mobileMetrics, setMobileMetrics] = useState<{
    leo: { rtt: number; downlinkGbps: number } | null;
    geo: { rtt: number; downlinkGbps: number } | null;
    totalGbps: number;
    coveredCount: number;
  }>({ leo: null, geo: null, totalGbps: 0, coveredCount: 0 });
  const viewerRef = useRef<any>(null);
  const globeContainerRef = useRef<HTMLDivElement>(null);

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

    const hasSelection = !!(selectedPosition || analyzisPosition || selectedSatellite || selectedAircraft);
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
  //   • Responsive effect (deps [selectedSatellite?.id, hoveredSatelliteId]) — keeps
  //     the stable refs current and fires an immediate tick on selection/hover changes
  //     so ONEWEB coverage recalculates without waiting up to 2 s.

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — runs once on mount

  // Keep selection/hover refs current and fire an immediate tick so ONEWEB coverage
  // recalculates at once instead of waiting up to 2 s for the next scheduled tick.
  useEffect(() => {
    selectedSatelliteIdRef.current = selectedSatellite?.id ?? null;
    hoveredSatelliteIdRef.current = hoveredSatelliteId;

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
  }, [selectedSatellite?.id, hoveredSatelliteId]);

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
    // Clear selectedPosition when satellite is selected to avoid SNP/satellite conflict
    setSelectedPosition(null);
    // Clear analyzis position when satellite is manually selected (satellite inspection mode)
    setAnalyzisPosition(null);
    setCandidateCoverages([]);
    setSelectedCoverage(null);
    // Clear selected SNP and inspected SNP when entering satellite inspection mode
    setSelectedSNP(null);
    setInspectedSNP(null);
    setAutoSelectedLEOId(null);
    setAutoSelectedGEOId(null);
  }, []);

  // Wrapper for UI selection (triggers FlyTo)
  const handleSatelliteSelectFromUI = useCallback((satellite: SatelliteData | null) => {
    handleSatelliteClick(satellite);
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
    // Clear SNP hover when satellite is hovered
    if (satelliteId) {
      setHoveredSnpName(null);
    }
  }, []); // Hover handler for satellites

  // Performance optimization: Memoize event handlers to prevent unnecessary re-renders
  const handleSnpClick = useCallback((snpName: string | { lat: number; lng: number; name: string } | null) => {
    if (!snpName) {
      setSelectedSNP(null);
      setInspectedSNP(null);
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
  }, []);

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
        now,
        coveragePolicy,
        failedSnps
      );

      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setSelectedSNP(selectedSNP);
      syncGeoCoverageSelection({ lat: position.lat, lng: position.lng }, false);

      if (!autoSelectedLEOSat && !autoSelectedGEOSat) {
        setAutoSelectedLEOId(null);
        setSelectedSNP(null);
      }
    } else {
      setAutoSelectedLEOId(null);
      setSelectedSNP(null);
      syncGeoCoverageSelection(null, false);
    }
  }, [coveragePolicy, satelliteScope, syncGeoCoverageSelection]); // §1.2 — satellites removed from deps

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
      now,
      coveragePolicy,
      failedSnps
    );
    setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
    setSelectedSNP(newSelectedSNP);
    syncGeoCoverageSelection({ lat: analyzisPosition.lat, lng: analyzisPosition.lng }, true);
  }, [analyzisPosition, coveragePolicy, satelliteScope, syncGeoCoverageSelection]); // §1.1 — satellites removed

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
        now,
        coveragePolicy,
        failedSnps
      );

      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setSelectedSNP(newSNP);
      syncGeoCoverageSelection({ lat: pos.lat, lng: pos.lng }, true);
    };

    const interval = setInterval(reResolve, RESOLUTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [analyzisPosition, coveragePolicy, satelliteScope, syncGeoCoverageSelection]); // re-arm when position/scope/policy change

  // Handle geographic point click (earth-based analyzis)
  const handlePointClick = useCallback((lat: number, lng: number) => {
    const userLocation = { lat, lng };

    // Set selected position for UI compatibility
    setSelectedPosition(userLocation);

    // Clear aircraft selection when switching to earth-based analyzis
    setSelectedAircraft(null);

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
          const userLocation = { lat, lng };

          // Set selected position for UI compatibility
          setSelectedPosition(userLocation);
          setCameraTarget({ lat, lng, alt: 10000 }); // Trigger FlyTo for search

          // Clear aircraft selection when switching to earth-based analyzis
          setSelectedAircraft(null);

          // Update unified analyzis position
          updateAnalyzisPosition({
            lat,
            lng,
            source: 'earth'
          });

          setSearchQuery('');
        }
      } catch (error) {
        console.error('Error searching location:', error);
      }
    }
  }, [searchQuery, updateAnalyzisPosition]);

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
    onSizeScaleChange: setSizeScale,
    inspectedSNP,
    snpConnectedSatellites,
  }), [
    filteredSatellites, satelliteTypeByName, coverageFeaturesMemo, handlePointClick, selectedPosition,
    handleSatelliteClick, handleSatelliteHover, handleSnpClick, handleSnpHover,
    selectedSatellite, resolvedAutoLEO, activeGeoSatellite, selectedGEOBeam, candidateCoverages, selectedCoverage, selectedGeoBeamId, selectedSNP, dedicatedSNPForSelectedLEO,
    isFullscreen, satelliteScope, airTrafficEnabled, interpolatedAircraft,
    selectedAircraft, handleAircraftSelect, handleAircraftHover,
    maritimeTrafficEnabled, interpolatedVessels, selectedVessel, handleVesselSelect, cameraTarget,
    handleCameraReady, handleGlobeContainerReady, showSatelliteTrajectory, sizeScale,
    inspectedSNP, snpConnectedSatellites,
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
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center min-w-0">
                    <Satellite className="h-7 w-7 text-blue-600 flex-shrink-0" />
                    <h1 className="ml-2 text-lg font-bold text-gray-900 dark:text-white truncate">Capacity Analyzer</h1>
                  </div>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  <div className="flex-shrink-0 p-1 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex items-center gap-1">
                    <SatelliteScopeFilter
                      currentScope={satelliteScope}
                      onScopeChange={handleSatelliteScopeChange}
                    />
                    <SimulationSettings satelliteScope={satelliteScope} />
                    <SatelliteSelector
                      satellites={satellites}
                      onSelect={handleSatelliteSelectFromUI}
                      selectedSatellite={selectedSatellite}
                      satelliteScope={satelliteScope}
                    />
                  </div>
                  <div className="relative flex-shrink-0 w-44">
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
                  <div className="flex-shrink-0">
                    <AircraftSelector
                      aircraft={airTraffic.aircraft}
                      selectedAircraft={selectedAircraft}
                      onSelect={(aircraft) => handleAircraftSelect(aircraft, true)}
                      liveModeEnabled={airTrafficEnabled}
                      onToggleLiveMode={() => setAirTrafficEnabled(!airTrafficEnabled)}
                    />
                  </div>
                  <div className="flex-shrink-0">
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
            )
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center">
                <Satellite className="h-8 w-8 text-blue-600" />
                <h1 className="ml-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Eutelsat Capacity Analyzer</h1>
              </div>
              <div className="flex items-center w-full sm:w-auto gap-4">
                <div className="flex items-center gap-2 p-1 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                  <SatelliteScopeFilter
                    currentScope={satelliteScope}
                    onScopeChange={handleSatelliteScopeChange}
                  />
                  <SimulationSettings satelliteScope={satelliteScope} />
                  <SatelliteSelector
                    satellites={satellites}
                    onSelect={handleSatelliteSelectFromUI}
                    selectedSatellite={selectedSatellite}
                    satelliteScope={satelliteScope}
                  />
                </div>
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <form onSubmit={handleSearchInput}>
                    <input
                      type="text"
                      name="search"
                      placeholder="Search location..."
                      className="w-full sm:w-48 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </form>
                </div>
                <AircraftSelector
                  aircraft={airTraffic.aircraft}
                  selectedAircraft={selectedAircraft}
                  onSelect={(aircraft) => handleAircraftSelect(aircraft, true)}
                  liveModeEnabled={airTrafficEnabled}
                  onToggleLiveMode={() => setAirTrafficEnabled(!airTrafficEnabled)}
                />
                <VesselSelector
                  vessels={maritimeTraffic.vessels}
                  selectedVessel={selectedVessel}
                  onSelect={(vessel) => handleVesselSelect(vessel, true)}
                  liveModeEnabled={maritimeTrafficEnabled}
                  onToggleLiveMode={() => setMaritimeTrafficEnabled(!maritimeTrafficEnabled)}
                />
                <div className="flex-shrink-0">
                  <ThemeSelector />
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {isMobile && isPhone && isSatelliteModalOpen && (
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
            </div>


            {!isFullscreen && (selectedPosition || analyzisPosition || selectedSatellite || selectedAircraft) && (
              <BottomSheet
                snap={mobileSheetSnap}
                onSnapChange={setMobileSheetSnap}
                snapPoints={isPhone ? [0.13, 0.5, 0.88] : [0.18, 0.5, 0.88]}
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
            </div>


            <div className={`flex-shrink-0 w-[500px] bg-white dark:bg-slate-950 rounded-lg shadow-lg overflow-hidden ${isFullscreen ? 'hidden' : ''}`}>
              {!isFullscreen && (
                <div className="w-full overflow-y-auto max-h-[calc(100vh-8rem)]">
                  {inspectedSNP ? (
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
                    // onMetricsChange is not needed for desktop sidebar
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
};

export default App;
