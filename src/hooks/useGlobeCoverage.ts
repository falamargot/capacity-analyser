/**
 * useGlobeCoverage — what the globe is allowed to draw.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2, sixth slice). Two related
 * derivations that had drifted 500 lines apart in the component:
 *
 *   1. which uplink/downlink coverage belongs on the globe for the active
 *      topology and direction — a set of rules with real content (STAR draws
 *      only the user side; MESH/P2P flips transmitter and receiver with the
 *      direction; a satellite mismatch draws nothing rather than a footprint
 *      from the wrong satellite);
 *   2. the GeoJSON feature list itself, deduplicated by coverage key.
 *
 * The second carries a hand-tuned dependency array with an eslint disable and a
 * comment naming what is excluded and why — hover is suppressed in analysis
 * mode, and satellite lookups go through a ref rather than a reactive dep.
 * Moved verbatim, comments included: that reasoning is the reason the memo is
 * shaped the way it is.
 */

import { useMemo, type MutableRefObject } from 'react';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import type { CandidateCoverage } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import { LINK_MODE_REQUIRES_POINT_B, type LinkMode } from '../types/linkMode';
import {
  getCoverageBeamId, getCoverageGroupId, getFeatureBeamCoverageKey, resolveCoverageSelection,
} from '../utils/geoCoverageSelection';

export interface UseGlobeCoverageInput {
  linkMode: LinkMode;
  activeMeshTab: 'forward' | 'reverse';
  satellites: SatelliteData[];
  satellitesForResolutionRef: MutableRefObject<SatelliteData[]>;
  candidateCoveragesB: CandidateCoverage[];
  selectedUplinkCoverage: CandidateCoverage | null;
  selectedDownlinkCoverage: CandidateCoverage | null;
  selectedUplinkCoverageB: CandidateCoverage | null;
  selectedDownlinkCoverageB: CandidateCoverage | null;
  selectedSatellite: SatelliteData | null;
  liveSelectedSatellite: SatelliteData | null;
  selectedGeoCoverageName: string | null;
  selectedGeoBeamId: string | null;
  visibleManualGeoCoverageKeys: string[];
  satelliteScope: string;
  analyzisPosition: unknown;
  selectedPosition: unknown;
  resolvedAutoLEO: { coverages: Array<{ feature: Feature<Geometry, GeoJsonProperties> }> } | null;
  hoveredSatelliteId: string | null;
}

export function useGlobeCoverage(input: UseGlobeCoverageInput) {
  const {
    linkMode, activeMeshTab, satellites, satellitesForResolutionRef, candidateCoveragesB,
    selectedUplinkCoverage, selectedDownlinkCoverage,
    selectedUplinkCoverageB, selectedDownlinkCoverageB,
    selectedSatellite, liveSelectedSatellite, selectedGeoCoverageName, selectedGeoBeamId,
    visibleManualGeoCoverageKeys, satelliteScope, analyzisPosition, selectedPosition,
    resolvedAutoLEO, hoveredSatelliteId,
  } = input;

  const activeSatId = selectedDownlinkCoverage?.satelliteId ?? selectedUplinkCoverage?.satelliteId ?? null;
  const uplinkAtBForGlobe = useMemo(() => {
    if (!LINK_MODE_REQUIRES_POINT_B.has(linkMode) || !activeSatId) return null;
    if (selectedUplinkCoverageB?.satelliteId === activeSatId) return selectedUplinkCoverageB;
    return candidateCoveragesB.find(c => c.isUplink && !c.isSynthesized && c.satelliteId === activeSatId) ?? null;
  }, [linkMode, activeSatId, candidateCoveragesB, selectedUplinkCoverageB]);
  const downlinkAtBForGlobe = useMemo(() => {
    if (!LINK_MODE_REQUIRES_POINT_B.has(linkMode) || !activeSatId) return null;
    if (selectedDownlinkCoverageB?.satelliteId === activeSatId) return selectedDownlinkCoverageB;
    return candidateCoveragesB.find(c => !c.isUplink && !c.isSynthesized && c.satelliteId === activeSatId) ?? null;
  }, [linkMode, activeSatId, candidateCoveragesB, selectedDownlinkCoverageB]);

  const globeUplinkCoverage = useMemo(() => {
    if (linkMode === 'STAR_FORWARD') return null;
    if (linkMode === 'STAR_RETURN') return selectedUplinkCoverage ?? null;
    if (LINK_MODE_REQUIRES_POINT_B.has(linkMode)) {
      // MESH/P2P forward (A→B): uplink transmitter is Point A
      // MESH/P2P reverse (B→A): uplink transmitter is Point B
      return (activeMeshTab === 'forward' ? selectedUplinkCoverage : uplinkAtBForGlobe) ?? null;
    }
    if (!selectedUplinkCoverage) return null;
    if (selectedDownlinkCoverage && selectedUplinkCoverage.satelliteId !== selectedDownlinkCoverage.satelliteId) return null;
    return selectedUplinkCoverage;
  }, [linkMode, selectedUplinkCoverage, selectedDownlinkCoverage, activeMeshTab, uplinkAtBForGlobe]);

  const globeDownlinkCoverage = useMemo(() => {
    if (linkMode === 'STAR_RETURN') return null;
    if (linkMode === 'STAR_FORWARD') return selectedDownlinkCoverage ?? null;
    if (LINK_MODE_REQUIRES_POINT_B.has(linkMode)) {
      // MESH/P2P forward (A→B): downlink receiver is Point B
      // MESH/P2P reverse (B→A): downlink receiver is Point A
      return (activeMeshTab === 'forward' ? downlinkAtBForGlobe : selectedDownlinkCoverage) ?? null;
    }
    if (!selectedDownlinkCoverage) return null;
    if (selectedUplinkCoverage && selectedDownlinkCoverage.satelliteId !== selectedUplinkCoverage.satelliteId) return null;
    return selectedDownlinkCoverage;
  }, [linkMode, selectedDownlinkCoverage, selectedUplinkCoverage, activeMeshTab, downlinkAtBForGlobe]);

  // Single coverage reference kept for legacy consumers and for the map switcher.
  // It must represent the user-terminal side of the active topology:
  //   STAR Forward: gateway uplink -> user downlink, so user side is downlink.
  //   STAR Return: user uplink -> gateway downlink, so user side is uplink.
  const selectedCoverage = useMemo(() => {
    if (linkMode === 'STAR_RETURN') {
      return selectedUplinkCoverage ?? null;
    }

    if (linkMode === 'STAR_FORWARD') {
      return selectedDownlinkCoverage ?? null;
    }

    return selectedDownlinkCoverage ?? selectedUplinkCoverage ?? null;
  }, [linkMode, selectedDownlinkCoverage, selectedUplinkCoverage]);
  const resolvedSelectedGeoCoverage = useMemo(() => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT' || !selectedGeoCoverageName) {
      return null;
    }

    const beams = selectedSatellite.coverages.filter((coverage) => getCoverageGroupId(coverage) === selectedGeoCoverageName);
    if (beams.length === 0) {
      return null;
    }

    const primaryBeam = selectedGeoBeamId
      ? beams.find((coverage) => getCoverageBeamId(coverage) === selectedGeoBeamId) ?? beams[0]
      : beams[0];

    return {
      satellite: selectedSatellite,
      beams,
      primaryBeam,
    };
  }, [selectedGeoBeamId, selectedGeoCoverageName, selectedSatellite]);

  const resolvedTargetGeoCoverage = useMemo(() => (
    resolveCoverageSelection(selectedCoverage, satellites)
  ), [selectedCoverage, satellites]);

  const coverageFeaturesMemo = useMemo(() => {
    const features = new Map<string, Feature<Geometry, GeoJsonProperties>>();
    const pushFeature = (feature: Feature<Geometry, GeoJsonProperties>) => {
      // Some upstream coverage records can carry a null geometry; skip them so
      // the Cesium coverage layer never crashes on malformed data.
      if (!feature.geometry) {
        return;
      }

      const coverageGeometryKey = typeof feature.properties?.coverageGeometryKey === 'string'
        ? feature.properties.coverageGeometryKey
        : null;
      const baseKey = getFeatureBeamCoverageKey(feature)
        ?? `${feature.properties?.type ?? 'feature'}::${feature.properties?.satelliteId ?? 'unknown'}::${feature.properties?.name ?? features.size}`;
      const key = coverageGeometryKey ? `${baseKey}::${coverageGeometryKey}` : baseKey;
      if (!features.has(key)) {
        features.set(key, feature);
      }
    };

    // If user has explicitly selected a satellite, show its coverage (Satellite Inspection mode)
    if (liveSelectedSatellite) {
      if (liveSelectedSatellite.type === 'EUTELSAT') {
        const visibleCoverageKeys = new Set(visibleManualGeoCoverageKeys);
        liveSelectedSatellite.coverages
          .filter((coverage) => visibleCoverageKeys.has(getCoverageGroupId(coverage)))
          .forEach((coverage) => pushFeature(coverage.feature));
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

    // SINGLE-COVERAGE RULE: only the SELECTED GEO coverage is ever rendered on
    // the globe. All candidates are listed in the sidebar; CoverageLayer uses
    // isSelected to apply the gradient style to the selected coverage's contours.
    //
    // resolvedSelectedGeoCoverage is the primary source. When it is null despite
    // selectedCoverage being set (can happen on the first render before useMemo
    // has resolved with the latest satellites), we fall back to a direct lookup
    // from satellitesForResolutionRef (always current). This ensures the globe
    // is NEVER stuck in an empty state when a valid coverage is selected.
    const getSelectedGeoFeatures = (): Feature<Geometry, GeoJsonProperties>[] => {
      if (resolvedSelectedGeoCoverage) {
        return resolvedSelectedGeoCoverage.beams.map((beam) => beam.feature);
      }
      // Direct fallback: resolve features without going through React state
      if (selectedCoverage) {
        const sat = satellitesForResolutionRef.current.find(
          (s) => s.id === selectedCoverage.satelliteId
        );
        if (sat) {
          return sat.coverages
            .filter((c) => getCoverageGroupId(c) === selectedCoverage.coverageKey)
            .map((c) => c.feature)
            .filter(Boolean) as Feature<Geometry, GeoJsonProperties>[];
        }
      }
      return [];
    };
    const selectedGeoFeatures = getSelectedGeoFeatures();

    // Show coverage based on scope rules:
    //   LEO  → only LEO (ONEWEB) footprint from the auto-selected satellite
    //   GEO  → only the one selected GEO coverage
    //   ALL  → LEO footprint + one selected GEO coverage
    // In all cases, NEVER inject hover-satellite features in analysis mode.
    // Hover effects only apply in satellite-inspection mode (handled above).
    if (satelliteScope === 'LEO' && resolvedAutoLEO) {
      resolvedAutoLEO.coverages.forEach((c: any) => pushFeature(c.feature));
    } else if (satelliteScope === 'GEO') {
      selectedGeoFeatures.forEach((feature) => pushFeature(feature));
    } else if (satelliteScope === 'ALL') {
      if (resolvedAutoLEO) {
        resolvedAutoLEO.coverages.forEach((c: any) => pushFeature(c.feature));
      }
      selectedGeoFeatures.forEach((feature) => pushFeature(feature));
    }

    return [...features.values()];
  // Note: hoveredSatelliteId intentionally excluded — hover effects are suppressed
  // in analysis mode to prevent feature bloat and visual clutter (CoverageLayer
  // would filter them out anyway). satelliteScope, selectedCoverage and
  // resolvedSelectedGeoCoverage cover all necessary re-computation triggers.
  // filteredSatellites omitted: hover lookups use satellitesForResolutionRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzisPosition, liveSelectedSatellite, resolvedAutoLEO, resolvedSelectedGeoCoverage, satelliteScope, selectedCoverage, selectedGeoBeamId, selectedGeoCoverageName, selectedPosition, visibleManualGeoCoverageKeys]);

  return {
    activeSatId,
    uplinkAtBForGlobe,
    downlinkAtBForGlobe,
    globeUplinkCoverage,
    globeDownlinkCoverage,
    selectedCoverage,
    resolvedSelectedGeoCoverage,
    resolvedTargetGeoCoverage,
    coverageFeaturesMemo,
  };
}
