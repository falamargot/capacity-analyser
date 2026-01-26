import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MapViewSwitcher from './components/MapViewSwitcher';
import CapacityDetails from './components/CapacityDetails';
import SatelliteSelector from './components/SatelliteSelector';
import AircraftSelector from './components/AircraftSelector';
import SatelliteScopeFilter, { SatelliteScope } from './components/SatelliteScopeFilter';
import { Search, Satellite } from 'lucide-react';
import { calculatePosition, fetchSatellites } from './services/satelliteService';
import { SatelliteData } from './types/satellites';
import type { GEOBeam, SelectedSNP } from './types/analysis';
import { calculateCoverages, destinationPoint } from './utils/coverageCalculator';
import { footprintRadiusKm, BACKHAUL_ELEVATION_DEG, STANDARD_ELEVATION_DEG } from './utils/leoFootprint';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { SNPS_DATA } from './components/globe/GlobeConfig';
import { calculateElevationAngle } from './utils/capacityCalculator';
import { useAirTraffic, useAirTrafficInterpolation } from './modules/airTraffic';
import { Aircraft } from './modules/airTraffic/airTrafficService';

// Analysis position for earth-click or aircraft selection
interface AnalysisPosition {
  lat: number;
  lng: number;
  altitude?: number;
  source: 'earth' | 'aircraft';
  aircraftCallsign?: string;
}

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number; altitude?: number } | null>(null);
  const [analysisPosition, setAnalysisPosition] = useState<AnalysisPosition | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteData | null>(null);
  const [autoSelectedLEOId, setAutoSelectedLEOId] = useState<string | null>(null);
  const [autoSelectedGEOId, setAutoSelectedGEOId] = useState<string | null>(null);
  const [selectedSNP, setSelectedSNP] = useState<SelectedSNP>(null);
  const [selectedGEOBeam, setSelectedGEOBeam] = useState<GEOBeam | null>(null);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [hoveredSatelliteId, setHoveredSatelliteId] = useState<string | null>(null);
  const [hoveredSnpName, setHoveredSnpName] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [satelliteScope, setSatelliteScope] = useState<SatelliteScope>('ALL');
  const [airTrafficEnabled, setAirTrafficEnabled] = useState(false);
  const [showSatelliteTrajectory, setShowSatelliteTrajectory] = useState(false);
  const [satelliteHighlight, setSatelliteHighlight] = useState(false);
  const viewerRef = useRef<any>(null);

  // Store viewer reference when ready
  const handleCameraReady = useCallback((viewer: any) => {
    viewerRef.current = viewer;
  }, []);

  // Performance optimization: Cache previous values to prevent unnecessary recalculations
  const prevSelectedSatelliteRef = useRef<string | null>(null);
  const prevSatellitesRef = useRef<SatelliteData[]>([]);

  // Throttle satellite position updates to reduce CPU load
  const satelliteUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper function: Check if point is inside GEO satellite coverage
  const isPointInGEOCoverage = (point: { lat: number; lng: number }, satellite: SatelliteData): boolean => {
    // For GEO satellites, use the coverage polygons from satellite data
    if (!satellite.coverages || satellite.coverages.length === 0) {
      // Fallback: use elevation angle as rough estimate if no coverage data available
      const elevation = calculateElevationAngle(point, satellite);
      return elevation >= 10;
    }

    // Check if point is inside any of the satellite's coverage areas
    for (const coverage of satellite.coverages) {
      const geometry = coverage.feature?.geometry;
      if (geometry && geometry.type === 'Polygon') {
        const ring = geometry.coordinates[0] as unknown as number[][];
        // Simple point-in-polygon check for GEO coverage
        if (isPointInPolygon(point, ring)) {
          return true;
        }
      }
    }
    return false;
  };

  // Helper function: Simple point-in-polygon check
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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Helper function: Resolve auto-selected satellites based on business rules
  const resolveAutoSelectedSatellites = (
    userLocation: { lat: number; lng: number },
    satellites: SatelliteData[],
    satelliteScope: SatelliteScope
  ) => {
    let autoSelectedGEOSat = null;
    let autoSelectedLEOSat = null;
    let selectedSNP = null;

    // GEO satellite selection logic - only run when GEO is allowed
    if (satelliteScope === 'ALL' || satelliteScope === 'GEO') {
      const geoSatellites = satellites.filter(sat => sat.orbitType === 'GEO');

      // Find all GEO satellites that cover the location
      const coveredGEO = geoSatellites.filter(sat =>
        isPointInGEOCoverage(userLocation, sat)
      );

      // Select GEO satellite based on business rules
      if (coveredGEO.length === 1) {
        // If exactly one GEO satellite covers the location → select it
        autoSelectedGEOSat = coveredGEO[0];
      } else if (coveredGEO.length > 1) {
        // If multiple GEO satellites cover the location → select one with highest elevation angle
        const satellitesWithElevation = coveredGEO.map(sat => ({
          satellite: sat,
          elevation: calculateElevationAngle(userLocation, sat)
        }));

        // Sort by highest elevation angle
        satellitesWithElevation.sort((a, b) => b.elevation - a.elevation);
        autoSelectedGEOSat = satellitesWithElevation[0].satellite;
      }
    }

    // LEO satellite selection logic - only run when LEO is allowed
    if (satelliteScope === 'ALL' || satelliteScope === 'LEO') {
      const leoSatellites = satellites.filter(sat => sat.orbitType === 'LEO');

      // Apply hard eligibility rules
      const eligibleLEO = leoSatellites.filter(sat => {
        const elevation = calculateElevationAngle(userLocation, sat);

        // Rule 1: User-to-satellite elevation angle ≥ 37° (STANDARD coverage requirement)
        if (elevation < STANDARD_ELEVATION_DEG) return false;

        // Rule 2: Satellite is visible above user horizon (elevation > 0°)
        if (elevation <= 0) return false;

        // Rule 3: Satellite sees at least one SNP (gateway) simultaneously with SNP elevation ≥ 15°
        let hasVisibleSNP = false;
        for (const snp of SNPS_DATA) {
          const snpElevation = calculateElevationAngle(
            { lat: snp.lat, lng: snp.lng }, sat
          );
          if (snpElevation >= 15) {
            hasVisibleSNP = true;
            break;
          }
        }
        if (!hasVisibleSNP) return false;

        return true;
      });

      // Score eligible LEO satellites
      const scoredLEO = eligibleLEO.map(sat => {
        const elevation = calculateElevationAngle(userLocation, sat);

        // Scoring criteria (normalized, deterministic)
        const elevationScore = elevation / 90;
        const persistenceScore = 0.5; // Neutral value

        // Count visible SNPs
        let visibleSNPCount = 0;
        let bestSNP = null;
        let bestSNPElevation = -1;

        for (const snp of SNPS_DATA) {
          const snpElevation = calculateElevationAngle(
            { lat: snp.lat, lng: snp.lng }, sat
          );
          if (snpElevation >= 15) {
            visibleSNPCount++;
            if (snpElevation > bestSNPElevation) {
              bestSNPElevation = snpElevation;
              bestSNP = snp;
            }
          }
        }
        const snpScore = visibleSNPCount >= 2 ? 1.0 : 0.8;
        const loadScore = 0.5;

        // Global score
        const totalScore =
          0.45 * elevationScore +
          0.25 * persistenceScore +
          0.20 * snpScore +
          0.10 * loadScore;

        return {
          satellite: sat,
          elevation,
          totalScore,
          bestSNP
        };
      });

      // Select LEO satellite with highest score
      if (scoredLEO.length > 0) {
        scoredLEO.sort((a, b) => b.totalScore - a.totalScore);
        autoSelectedLEOSat = scoredLEO[0].satellite;
        selectedSNP = scoredLEO[0].bestSNP;
      } else {
        // Fallback: Check if there are LEO satellites visible but without SNP connectivity
        // This handles the case where a location has only LEO satellites without any SNP connection
        const visibleLEO = leoSatellites.filter(sat => {
          const elevation = calculateElevationAngle(userLocation, sat);

          // Rule 1: User-to-satellite elevation angle ≥ 37° (STANDARD coverage requirement)
          if (elevation < STANDARD_ELEVATION_DEG) return false;

          // Rule 2: Satellite is visible above user horizon (elevation > 0°)
          if (elevation <= 0) return false;

          return true;
        });

        if (visibleLEO.length > 0) {
          // Select the best visible LEO satellite based on elevation only (no SNP available)
          const satellitesWithElevation = visibleLEO.map(sat => ({
            satellite: sat,
            elevation: calculateElevationAngle(userLocation, sat)
          }));

          satellitesWithElevation.sort((a, b) => b.elevation - a.elevation);
          autoSelectedLEOSat = satellitesWithElevation[0].satellite;
          // No SNP selected - this indicates LEO-only connectivity without ground station
          selectedSNP = null;
        }
      }
    }

    return {
      autoSelectedLEOSat,
      autoSelectedGEOSat,
      selectedSNP
    };
  };

  // Air traffic data fetching and filtering
  const airTraffic = useAirTraffic(
    { enabled: airTrafficEnabled },
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


  // Update coverage features based on analysis position or manual satellite selection
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

    // Only show coverage when analysis position is set (connectivity analysis mode)
    if (!analysisPosition && !selectedPosition) {
      return features;
    }

    // Show coverage based on auto-selected satellites according to scope rules
    if (satelliteScope === 'LEO' && resolvedAutoLEO) {
      // Display LEO coverage ONLY from resolved auto-selected LEO
      resolvedAutoLEO.coverages.forEach((c: any) => features.push(c.feature));
    } else if (satelliteScope === 'GEO' && resolvedAutoGEO) {
      // Display GEO coverage - if satellite is manually selected, show all coverages
      if (liveSelectedSatellite && liveSelectedSatellite.type === 'EUTELSAT') {
        // Satellite inspection mode: show all coverages of manually selected GEO satellite
        liveSelectedSatellite.coverages.forEach(c => features.push(c.feature));
      } else {
        // Auto-selection mode: show only selected beam
        if (selectedGEOBeam) {
          features.push(selectedGEOBeam.feature);
        }
      }
    } else if (satelliteScope === 'ALL') {
      // Display both LEO and GEO coverage from resolved auto-selected satellites
      if (resolvedAutoLEO) {
        resolvedAutoLEO.coverages.forEach((c: any) => features.push(c.feature));
      }
      if (resolvedAutoGEO) {
        if (liveSelectedSatellite && liveSelectedSatellite.type === 'EUTELSAT') {
          // Satellite inspection mode: show all coverages of manually selected GEO satellite
          liveSelectedSatellite.coverages.forEach((c: any) => features.push(c.feature));
        } else {
          // Auto-selection mode: show only selected beam
          if (selectedGEOBeam) {
            features.push(selectedGEOBeam.feature);
          }
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
  }, [filteredSatellites, selectedPosition, analysisPosition, liveSelectedSatellite, resolvedAutoLEO, resolvedAutoGEO, selectedGEOBeam, hoveredSatelliteId, hoveredSnpName, satelliteScope]);


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
      setAnalysisPosition(null);
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
    // Clear analysis position when satellite is manually selected (satellite inspection mode)
    setAnalysisPosition(null);
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
  const handleSnpClick = useCallback((snpName: string | null) => {
    setSelectedSNP(snpName);
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

  // Unified function to handle analysis position changes (from earth click or aircraft)
  const updateAnalysisPosition = useCallback((position: AnalysisPosition | null) => {
    setAnalysisPosition(position);

    if (position) {
      // Clear any manual satellite selection when analysis position changes
      setSelectedSatellite(null);

      // Auto-resolve BEST connectivity according to business rules
      const { autoSelectedLEOSat, autoSelectedGEOSat, selectedSNP } = resolveAutoSelectedSatellites(
        { lat: position.lat, lng: position.lng },
        satellites,
        satelliteScope
      );

      // Store results ONLY as IDs (never store objects)
      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setAutoSelectedGEOId(autoSelectedGEOSat?.id || null);
      setSelectedSNP(selectedSNP);

      // Auto-select GEO beam if GEO satellite is available
      if (autoSelectedGEOSat && autoSelectedGEOSat.coverages && autoSelectedGEOSat.coverages.length > 0) {
        // Find the best coverage beam for this position
        const userLocation = { lat: position.lat, lng: position.lng };
        let bestBeam = null;
        let bestElevation = -1;

        for (const coverage of autoSelectedGEOSat.coverages) {
          if (coverage.feature && coverage.feature.geometry) {
            // Simple check: if point is within coverage polygon
            const geometry = coverage.feature.geometry;
            if (geometry.type === 'Polygon') {
              const ring = geometry.coordinates[0] as unknown as number[][];
              if (isPointInPolygon(userLocation, ring)) {
                const elevation = calculateElevationAngle(userLocation, autoSelectedGEOSat);
                if (elevation > bestElevation) {
                  bestElevation = elevation;
                  bestBeam = coverage;
                }
              }
            }
          }
        }

        // If no beam contains the point, use the first beam as fallback
        if (!bestBeam && autoSelectedGEOSat.coverages.length > 0) {
          bestBeam = autoSelectedGEOSat.coverages[0];
        }

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
      // Clear auto-selected satellites and GEO beam when no analysis position
      setAutoSelectedLEOId(null);
      setAutoSelectedGEOId(null);
      setSelectedSNP(null);
      setSelectedGEOBeam(null);
    }
  }, [satellites, satelliteScope]);

  // Real-time updates when aircraft is selected
  useEffect(() => {
    if (selectedAircraft && selectedAircraft.latitude && selectedAircraft.longitude) {
      // Update analysis position as aircraft moves
      updateAnalysisPosition({
        lat: selectedAircraft.latitude,
        lng: selectedAircraft.longitude,
        altitude: selectedAircraft.altitude_km || undefined,
        source: 'aircraft',
        aircraftCallsign: selectedAircraft.callsign || undefined
      });
    }
  }, [selectedAircraft, updateAnalysisPosition]);

  // Clear auto-selected satellites when filter scope changes and makes them invalid
  useEffect(() => {
    if (analysisPosition) {
      // Re-resolve connectivity with new filter to check if current satellites are still valid
      const { autoSelectedLEOSat, autoSelectedGEOSat, selectedSNP: newSelectedSNP } = resolveAutoSelectedSatellites(
        { lat: analysisPosition.lat, lng: analysisPosition.lng },
        satellites,
        satelliteScope
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
  }, [satelliteScope, analysisPosition, satellites]);

  // Handle geographic point click (earth-based analysis)
  const handlePointClick = useCallback((lat: number, lng: number) => {
    const userLocation = { lat, lng };

    // Set selected position for UI compatibility
    setSelectedPosition(userLocation);

    // Clear aircraft selection when switching to earth-based analysis
    setSelectedAircraft(null);

    // Update unified analysis position
    updateAnalysisPosition({
      lat,
      lng,
      source: 'earth'
    });
  }, [updateAnalysisPosition]);

  // Handle aircraft selection (aircraft-based analysis)
  const handleAircraftSelect = useCallback((aircraft: Aircraft | null, fromComboBox: boolean = false) => {
    setSelectedAircraft(aircraft);

    if (aircraft && aircraft.latitude && aircraft.longitude) {
      // Clear earth-based position when switching to aircraft-based analysis
      setSelectedPosition(null);

      // Update unified analysis position with aircraft data
      updateAnalysisPosition({
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
      // Clear analysis position when aircraft is deselected
      updateAnalysisPosition(null);
    }
  }, [updateAnalysisPosition]);

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

        // Update the analysis position with the latest interpolated aircraft data
        updateAnalysisPosition({
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
  }, [selectedAircraft, airTrafficEnabled, interpolatedAircraft, updateAnalysisPosition]);

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

          // Clear aircraft selection when switching to earth-based analysis
          setSelectedAircraft(null);

          // Update unified analysis position
          updateAnalysisPosition({
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
  }, [searchQuery, updateAnalysisPosition]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Satellite className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700">Loading satellite data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center">
              <Satellite className="h-8 w-8 text-blue-600" />
              <h1 className="ml-2 text-2xl font-bold text-gray-900">Eutelsat Capacity Analyser</h1>
            </div>
            <div className="flex items-center w-full sm:w-auto gap-4">
              <SatelliteScopeFilter
                currentScope={satelliteScope}
                onScopeChange={handleSatelliteScopeChange}
              />
              <SatelliteSelector
                satellites={satellites}
                onSelect={handleSatelliteSelectFromUI}
                selectedSatellite={selectedSatellite}
                satelliteScope={satelliteScope}
              />
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <form onSubmit={handleSearchInput}>
                  <input
                    type="text"
                    name="search"
                    placeholder="Search location..."
                    className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-8 h-[calc(100vh-8rem)]`}>
          <div className={`flex-1 bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300 ${isFullscreen ? 'fixed top-[6rem] bottom-4 left-4 right-4 z-50' : ''
            }`}>
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
              selectedSNP={selectedSNP}
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
              showSatelliteTrajectory={showSatelliteTrajectory}
              satelliteHighlight={satelliteHighlight}
              onToggleSatelliteTrajectory={() => setShowSatelliteTrajectory(!showSatelliteTrajectory)}
              onToggleSatelliteHighlight={() => setSatelliteHighlight(!satelliteHighlight)}
            />
          </div>
          <div className={`${isMobile ? 'w-full' : 'flex-shrink-0 w-[500px]'} bg-white rounded-lg shadow-lg overflow-hidden`}>
            {!isFullscreen && (
              <div
                className={`w-full ${!selectedPosition && !selectedSatellite && !selectedAircraft && isMobile ? 'hidden' : ''
                  } overflow-y-auto max-h-[calc(100vh-8rem)]`}
              >
                <CapacityDetails
                  satellites={filteredSatellites}
                  selectedPoint={analysisPosition || selectedPosition}
                  selectedSatellite={selectedSatellite}
                  autoSelectedLEOSatellite={resolvedAutoLEO}
                  autoSelectedGEOSatellite={resolvedAutoGEO}
                  satelliteScope={satelliteScope}
                  onSelectedGEOBeamChange={handleSelectedGEOBeamChange}
                  analysisSource={selectedAircraft ? 'aircraft' : analysisPosition ? 'earth' : undefined}
                  aircraftCallsign={selectedAircraft?.callsign}
                  selectedSNP={selectedSNP}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
