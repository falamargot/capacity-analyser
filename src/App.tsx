import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MapViewSwitcher from './components/MapViewSwitcher';
import CapacityDetails from './components/CapacityDetails';
import SatelliteSelector from './components/SatelliteSelector';
import AircraftSelector from './components/AircraftSelector';
import VesselSelector from './components/VesselSelector';
import SatelliteScopeFilter, { SatelliteScope } from './components/SatelliteScopeFilter';
import { Search, Satellite, X } from 'lucide-react';
import { ThemeSelector } from './components/ThemeSelector';
import BottomSheet from './components/layout/BottomSheet';
import MobileAnalysisSummary from './components/layout/MobileAnalysisSummary';
import BeamLegend from './components/cesium-globe/BeamLegend';
import SimulationSettings from './components/layout/SimulationSettings';
import { calculatePosition, fetchSatellites } from './services/satelliteService';
import { SatelliteData } from './types/satellites';
import type { GEOBeam, SelectedSNP } from './types/analysis';
import { calculateCoverages, destinationPoint } from './utils/coverageCalculator';
import { footprintRadiusKm, BACKHAUL_ELEVATION_DEG } from './utils/leoFootprint';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { SNPS_DATA } from './components/globe/GlobeConfig';

import { resolveAutoSelectedSatellites, findBestGEOBeam } from './utils/satelliteResolution';
import { type CoveragePolicy } from './utils/leoFootprint';
import { JulianDate } from 'cesium';
import { useAirTraffic, useAirTrafficInterpolation } from './modules/airTraffic';
import { Aircraft } from './modules/airTraffic/airTrafficService';
import { useMaritimeTraffic } from './modules/maritimeTraffic';
import { Vessel } from './modules/maritimeTraffic/maritimeTrafficService';
import { useSimulation } from './contexts/SimulationContext';

// Analyzis position for earth-click or aircraft selection
interface AnalyzisPosition {
  lat: number;
  lng: number;
  altitude?: number;
  source: 'earth' | 'aircraft';
  aircraftCallsign?: string;
}

const App: React.FC = () => {
  const { coveragePolicy } = useSimulation();
  
  // Helper function to convert CoveragePolicy to legacy threshold for backwards compatibility
  const getCoveragePolicy = useCallback((): CoveragePolicy => {
    return coveragePolicy;
  }, [coveragePolicy]);
  const [searchQuery, setSearchQuery] = useState('');
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1100);
  const [isPhone, setIsPhone] = useState(window.innerWidth < 920);
  const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number; altitude?: number } | null>(null);
  const [analyzisPosition, setAnalyzisPosition] = useState<AnalyzisPosition | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteData | null>(null);
  const [autoSelectedLEOId, setAutoSelectedLEOId] = useState<string | null>(null);
  const [autoSelectedGEOId, setAutoSelectedGEOId] = useState<string | null>(null);
  const [selectedSNP, setSelectedSNP] = useState<SelectedSNP>(null);
  const [selectedGEOBeam, setSelectedGEOBeam] = useState<GEOBeam | null>(null);
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
    console.log('App: handleGlobeContainerReady called');
    console.log('App: ref parameter:', ref);
    console.log('App: ref.current:', ref.current);

    globeContainerRef.current = ref.current;
    console.log('App: globeContainerRef.current set to:', globeContainerRef.current);
  }, []);

  // Performance optimization: Cache previous values to prevent unnecessary recalculations
  const prevSelectedSatelliteRef = useRef<string | null>(null);
  const prevSatellitesRef = useRef<SatelliteData[]>([]);

  // Throttle satellite position updates to reduce CPU load
  const satelliteUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Performance optimization: Throttled satellite position updates
  useEffect(() => {
    // Clear any existing timeout
    if (satelliteUpdateTimeoutRef.current) {
      clearTimeout(satelliteUpdateTimeoutRef.current);
    }

    const updateSatellites = () => {
      setSatellites((currentSatellites) => {
        const currentSelectedId = selectedSatellite?.id || null;

        // Only update coverage calculation if selection actually changed
        const selectionChanged = prevSelectedSatelliteRef.current !== currentSelectedId;

        const updatedSatellites = currentSatellites.map((sat) => {
          const newPosition = calculatePosition(sat);

          // Performance optimization: Only recalculate coverage if selection changed or position moved significantly
          const positionChanged = prevSatellitesRef.current.length > 0 &&
            prevSatellitesRef.current.find(prev => prev.id === sat.id)?.position.alt !== newPosition.alt ||
            prevSatellitesRef.current.find(prev => prev.id === sat.id)?.position.lat !== newPosition.lat ||
            prevSatellitesRef.current.find(prev => prev.id === sat.id)?.position.lng !== newPosition.lng;

          const isSatelliteSelected = currentSelectedId === sat.id;
          const isSatelliteHovered = hoveredSatelliteId === sat.id;
          // Always recalculate coverage for selected or hovered satellites (show all coverages)
          // For non-selected/hovered satellites, only recalculate if selection or position changed
          const shouldRecalculateCoverage = isSatelliteSelected || isSatelliteHovered || selectionChanged || positionChanged;

          // Create updated satellite object with new position for coverage calculation
          const updatedSat = { ...sat, position: newPosition };

          return {
            ...sat,
            position: newPosition,
            coverages: shouldRecalculateCoverage ? calculateCoverages(updatedSat) : sat.coverages,
          };
        });

        // Update refs for next comparison
        prevSelectedSatelliteRef.current = currentSelectedId;
        prevSatellitesRef.current = updatedSatellites;

        return updatedSatellites;
      });

      // Schedule next update with reduced frequency for better performance
      satelliteUpdateTimeoutRef.current = setTimeout(updateSatellites, 2000); // Reduced from 1000ms to 2000ms
    };

    // Initial update
    updateSatellites();

    return () => {
      if (satelliteUpdateTimeoutRef.current) {
        clearTimeout(satelliteUpdateTimeoutRef.current);
      }
    };
  }, [selectedSatellite?.id]); // Only depend on satellite ID, not entire object

  // Filter satellites based on satellite scope
  const filteredSatellites = useMemo(() => {
    if (satelliteScope === 'ALL') {
      return satellites;
    }
    return satellites.filter(sat => sat.orbitType === satelliteScope);
  }, [satellites, satelliteScope]);

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

  // Resolve live satellite instance for selected satellite (real-time positions)
  const liveSelectedSatellite = useMemo(() =>
    satellites.find(s => s.id === selectedSatellite?.id) ?? null,
    [satellites, selectedSatellite?.id]
  );


  // Update coverage features based on analyzis position or manual satellite selection
  const coverageFeaturesMemo = useMemo(() => {
    const features: Feature<Geometry, GeoJsonProperties>[] = [];

    // If user has explicitly selected a satellite, show its coverage (Satellite Inspection mode)
    if (liveSelectedSatellite) {
      liveSelectedSatellite.coverages.forEach(c => features.push(c.feature));

      // Add hover effects for user interaction
      if (hoveredSatelliteId && hoveredSatelliteId !== liveSelectedSatellite.id) {
        const hoveredSat = filteredSatellites.find(sat => sat.id === hoveredSatelliteId);
        if (hoveredSat) {
          hoveredSat.coverages.forEach(c => features.push(c.feature));
        }
      }

      return features;
    }

    // Only show coverage when analyzis position is set (connectivity analyzis mode)
    if (!analyzisPosition && !selectedPosition) {
      return features;
    }

    // Show coverage based on auto-selected satellites according to scope rules
    if (satelliteScope === 'LEO' && resolvedAutoLEO) {
      // Display LEO coverage ONLY from resolved auto-selected LEO
      resolvedAutoLEO.coverages.forEach((c: any) => features.push(c.feature));
    } else if (satelliteScope === 'GEO' && resolvedAutoGEO) {
      // Auto-selection mode: show only selected beam
      if (selectedGEOBeam) {
        features.push(selectedGEOBeam.feature);
      }
    } else if (satelliteScope === 'ALL') {
      // Display both LEO and GEO coverage from resolved auto-selected satellites
      if (resolvedAutoLEO) {
        resolvedAutoLEO.coverages.forEach((c: any) => features.push(c.feature));
      }
      if (resolvedAutoGEO) {
        // Auto-selection mode: show only selected beam
        if (selectedGEOBeam) {
          features.push(selectedGEOBeam.feature);
        }
      }
    }

    // Add hover effects for user interaction (but don't change coverage display)
    if (hoveredSatelliteId) {
      const hoveredSat = filteredSatellites.find(sat => sat.id === hoveredSatelliteId);
      if (hoveredSat) {
        hoveredSat.coverages.forEach(c => features.push(c.feature));
      }
    }

    if (hoveredSnpName) {
      const hoveredSnp = SNPS_DATA.find(snp => snp.name === hoveredSnpName);
      if (hoveredSnp) {
        const snpVisibilityRadiusKm = footprintRadiusKm(1200, BACKHAUL_ELEVATION_DEG);
        const center = { lat: hoveredSnp.lat, lng: hoveredSnp.lng };
        const steps = 96;
        const snpRing: [number, number][] = [];
        for (let i = 0; i <= steps; i++) {
          const bearing = (i / steps) * 360;
          const point = destinationPoint(center, bearing, snpVisibilityRadiusKm);
          snpRing.push([point.lng, point.lat]);
        }
        const snpVisibilityArea: Feature = {
          type: 'Feature',
          properties: {
            type: 'SNP_VISIBILITY_AREA',
            satelliteId: hoveredSnp.name,
            name: `SNP visibility area (≥15° elevation)`,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [snpRing]
          }
        };
        features.push(snpVisibilityArea);
      }
    }

    return features;
  }, [filteredSatellites, selectedPosition, analyzisPosition, liveSelectedSatellite, resolvedAutoLEO, resolvedAutoGEO, selectedGEOBeam, hoveredSatelliteId, hoveredSnpName, satelliteScope]);


  // coverageFeaturesMemo is used directly - no need to copy to state

  // Handle satellite scope change with state reset
  const handleSatelliteScopeChange = useCallback((newScope: SatelliteScope) => {
    setSatelliteScope(newScope);

    // If currently selected satellite exists AND its type is NOT compatible with the new scope
    if (selectedSatellite && selectedSatellite.orbitType !== newScope && newScope !== 'ALL') {
      // Deselect the satellite
      setSelectedSatellite(null);
      // Clear any auto-selected satellite
      setAutoSelectedLEOId(null);
      setAutoSelectedGEOId(null);
      // Reset all dependent states
      setSelectedSNP(null);
      setSelectedGEOBeam(null);
      setSelectedPosition(null);
      setAnalyzisPosition(null);
      setSelectedAircraft(null);
    }
  }, [satelliteScope, selectedSatellite]);

  // Performance optimization: Memoize event handlers to prevent unnecessary re-renders
  const handleSatelliteClick = useCallback((satellite: SatelliteData | null) => {
    setSelectedSatellite(satellite);
    // Clear aircraft selection when satellite is selected
    setSelectedAircraft(null);
    // Clear selectedPosition when satellite is selected to avoid SNP/satellite conflict
    setSelectedPosition(null);
    // Clear analyzis position when satellite is manually selected (satellite inspection mode)
    setAnalyzisPosition(null);
    // Clear auto-selected GEO beam when entering satellite inspection mode
    setSelectedGEOBeam(null);
    // Clear selected SNP when entering satellite inspection mode
    setSelectedSNP(null);
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
      return;
    }

    if (typeof snpName === 'string') {
      setSelectedSNP(SNPS_DATA.find(snp => snp.name === snpName) ?? null);
      return;
    }

    setSelectedSNP(SNPS_DATA.find(snp => snp.name === snpName.name) ?? null);
  }, []);

  const handleAircraftHover = useCallback((_aircraft: Aircraft | null) => {
    // Aircraft hover logic - currently a no-op
  }, []);

  const handleSnpHover = useCallback((snpName: string | null) => {
    setHoveredSnpName(snpName);
    // Clear satellite hover when SNP is hovered
    if (snpName) {
      setHoveredSatelliteId(null);
    }
  }, []); // Hover handler for SNPs

  // Handle GEO beam selection from CapacityDetails
  const handleSelectedGEOBeamChange = useCallback((beam: any) => {
    setSelectedGEOBeam(beam);
  }, []);

  // Unified function to handle analyzis position changes (from earth click or aircraft)
  const updateAnalyzisPosition = useCallback((position: AnalyzisPosition | null) => {
    setAnalyzisPosition(position);

    if (position) {
      // Clear any manual satellite selection when analyzis position changes
      setSelectedSatellite(null);

      // Auto-resolve BEST connectivity according to Service Availability model
      const now = JulianDate.fromDate(new Date());
      const { autoSelectedLEOSat, autoSelectedGEOSat, selectedSNP } = resolveAutoSelectedSatellites(
        { lat: position.lat, lng: position.lng },
        satellites,
        satelliteScope,
        now,
        getCoveragePolicy()
      );

      // Store results ONLY as IDs (never store objects)
      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setAutoSelectedGEOId(autoSelectedGEOSat?.id || null);
      setSelectedSNP(selectedSNP);

      // Auto-select GEO beam using centralized findBestGEOBeam
      if (autoSelectedGEOSat) {
        const bestBeam = findBestGEOBeam(
          { lat: position.lat, lng: position.lng },
          autoSelectedGEOSat
        );
        setSelectedGEOBeam(bestBeam);
      } else {
        setSelectedGEOBeam(null);
      }

      // Additional safeguard: if no satellites are auto-selected, clear all related states
      if (!autoSelectedLEOSat && !autoSelectedGEOSat) {
        setAutoSelectedLEOId(null);
        setAutoSelectedGEOId(null);
        setSelectedSNP(null);
        setSelectedGEOBeam(null);
      }
    } else {
      // Clear auto-selected satellites and GEO beam when no analyzis position
      setAutoSelectedLEOId(null);
      setAutoSelectedGEOId(null);
      setSelectedSNP(null);
      setSelectedGEOBeam(null);
    }
  }, [satellites, satelliteScope]);

  // Real-time updates when aircraft is selected
  useEffect(() => {
    if (selectedAircraft && selectedAircraft.latitude && selectedAircraft.longitude) {
      // Update analyzis position as aircraft moves
      updateAnalyzisPosition({
        lat: selectedAircraft.latitude,
        lng: selectedAircraft.longitude,
        altitude: selectedAircraft.altitude_km || undefined,
        source: 'aircraft',
        aircraftCallsign: selectedAircraft.callsign || undefined
      });
    }
  }, [selectedAircraft, updateAnalyzisPosition]);

  // Clear auto-selected satellites when filter scope changes and makes them invalid
  useEffect(() => {
    if (analyzisPosition) {
      // Re-resolve connectivity with new filter to check if current satellites are still valid
      const now = JulianDate.fromDate(new Date());
      const { autoSelectedLEOSat, autoSelectedGEOSat, selectedSNP: newSelectedSNP } = resolveAutoSelectedSatellites(
        { lat: analyzisPosition.lat, lng: analyzisPosition.lng },
        satellites,
        satelliteScope,
        now,
        getCoveragePolicy()
      );

      // Update states with new resolution
      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setAutoSelectedGEOId(autoSelectedGEOSat?.id || null);
      setSelectedSNP(newSelectedSNP);

      // Clear GEO beam if no GEO satellite is selected
      if (!autoSelectedGEOSat) {
        setSelectedGEOBeam(null);
      }
    }
  }, [satelliteScope, analyzisPosition, satellites, coveragePolicy]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <Satellite className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700">Loading satellite data...</p>
        </div>
      </div>
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
                  {(satelliteScope === 'ALL' || satelliteScope === 'LEO') && (
                    <SimulationSettings satelliteScope={satelliteScope} />
                  )}
                  {satelliteScope === 'GEO' && (
                    <SimulationSettings satelliteScope={satelliteScope} />
                  )}
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
              <MapViewSwitcher
                satellites={filteredSatellites}
                coverageFeatures={coverageFeaturesMemo}
                onPointClick={handlePointClick}
                selectedPosition={selectedPosition}
                onSatelliteClick={handleSatelliteClick}
                onSatelliteHover={handleSatelliteHover}
                onSnpClick={handleSnpClick}
                onSnpHover={handleSnpHover}
                selectedSatellite={selectedSatellite}
                autoSelectedLEOSatellite={resolvedAutoLEO}
                autoSelectedGEOSatellite={resolvedAutoGEO}
                selectedGEOBeam={selectedGEOBeam}
                selectedSNP={selectedSNP}
                dedicatedSNPForSelectedLEO={null}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
                satelliteScope={satelliteScope}
                airTrafficEnabled={airTrafficEnabled}
                aircraft={interpolatedAircraft}
                selectedAircraft={selectedAircraft}
                onAircraftClick={handleAircraftSelect}
                onAircraftHover={handleAircraftHover}
                cameraTarget={cameraTarget}
                onCameraReady={handleCameraReady}
                onGlobeContainerReady={handleGlobeContainerReady}
                showSatelliteTrajectory={showSatelliteTrajectory}
                sizeScale={sizeScale}
                onToggleSatelliteTrajectory={() => setShowSatelliteTrajectory(!showSatelliteTrajectory)}
                onSizeScaleChange={setSizeScale}
                isPhone={isPhone}
              />
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
                    autoSelectedGEOSatellite={resolvedAutoGEO}
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
                  autoSelectedGEOSatellite={resolvedAutoGEO}
                  satelliteScope={satelliteScope}
                  onSelectedGEOBeamChange={handleSelectedGEOBeamChange}
                  onSatelliteClick={handleSatelliteClick}
                  analysisSource={selectedAircraft ? 'aircraft' : analyzisPosition ? 'earth' : undefined}
                  aircraftCallsign={selectedAircraft?.callsign}
                  selectedSNP={selectedSNP}
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
              <MapViewSwitcher
                satellites={filteredSatellites}
                coverageFeatures={coverageFeaturesMemo}
                onPointClick={handlePointClick}
                selectedPosition={selectedPosition}
                onSatelliteClick={handleSatelliteClick}
                onSatelliteHover={handleSatelliteHover}
                onSnpClick={handleSnpClick}
                onSnpHover={handleSnpHover}
                selectedSatellite={selectedSatellite}
                autoSelectedLEOSatellite={resolvedAutoLEO}
                autoSelectedGEOSatellite={resolvedAutoGEO}
                selectedGEOBeam={selectedGEOBeam}
                selectedSNP={selectedSNP}
                dedicatedSNPForSelectedLEO={null}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
                satelliteScope={satelliteScope}
                airTrafficEnabled={airTrafficEnabled}
                aircraft={interpolatedAircraft}
                selectedAircraft={selectedAircraft}
                onAircraftClick={handleAircraftSelect}
                onAircraftHover={handleAircraftHover}
                cameraTarget={cameraTarget}
                onCameraReady={handleCameraReady}
                onGlobeContainerReady={handleGlobeContainerReady}
                showSatelliteTrajectory={showSatelliteTrajectory}
                sizeScale={sizeScale}
                onToggleSatelliteTrajectory={() => setShowSatelliteTrajectory(!showSatelliteTrajectory)}
                onSizeScaleChange={setSizeScale}
                isPhone={false}
              />
              {satelliteScope !== 'GEO' && <BeamLegend />}
            </div>


            <div className={`flex-shrink-0 w-[500px] bg-white dark:bg-slate-950 rounded-lg shadow-lg overflow-hidden ${isFullscreen ? 'hidden' : ''}`}>
              {!isFullscreen && (
                <div className="w-full overflow-y-auto max-h-[calc(100vh-8rem)]">
                  <CapacityDetails
                    satellites={filteredSatellites}
                    selectedPoint={analyzisPosition || selectedPosition}
                    selectedSatellite={selectedSatellite}
                    autoSelectedLEOSatellite={resolvedAutoLEO}
                    autoSelectedGEOSatellite={resolvedAutoGEO}
                    satelliteScope={satelliteScope}
                    onSelectedGEOBeamChange={handleSelectedGEOBeamChange}
                    onSatelliteClick={handleSatelliteClick}
                    analysisSource={selectedAircraft ? 'aircraft' : analyzisPosition ? 'earth' : undefined}
                    aircraftCallsign={selectedAircraft?.callsign}
                    selectedSNP={selectedSNP}
                  // onMetricsChange is not needed for desktop sidebar
                  />
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
