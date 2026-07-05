/**
 * CesiumGlobe - Main container component for the Cesium globe viewer
 *
 * REFACTORED: This component was split from a 970-line monolith into focused,
 * memoized child components for better performance and maintainability.
 *
 * Key changes:
 * 1. CallbackProperty instances are now cached in refs/hooks instead of being
 *    recreated on every render
 * 2. Entity layers are extracted into memoized components
 * 3. UI elements (controls, indicators) are separated
 * 4. Intervals are properly cleaned up with refs
 * 5. Ion token moved to main.tsx (app entry point)
 */
import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEvent } from 'resium';
import {
    Cartesian2,
    Cartesian3,
    Cartographic,
    Color,
    Math as CesiumMath,
    Viewer as CesiumViewerType,
    ScreenSpaceEventType,
    KeyboardEventModifier,
    defined,
    CallbackProperty,
    SceneMode,
    ClockStep,
    JulianDate,
    ImageryLayer,
    Simon1994PlanetaryPositions,
    createDefaultImageryProviderViewModels,
    BoundingSphere,
    HeadingPitchRange,
    Rectangle,
    type ProviderViewModel
} from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../types/satellites';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { AircraftInterpolation } from '../modules/airTraffic/useAirTraffic';
import type { IssPosition, IssOrbitPath } from '../modules/iss/issService';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import type { VesselInterpolation } from '../modules/maritimeTraffic/useMaritimeTraffic';
import type { SatelliteScope } from './SatelliteScopeFilter';
import type { CandidateCoverage, GEOBeam, MobileAnalysisMetrics, Selection } from '../types/analysis';
import { getPosition, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './cesium-globe/utils';
import { useCesiumTheme } from '../hooks/useCesiumTheme';
import {
    getEffectiveFillRateLayerVisible,
    isFillRateLayerAvailableForScope,
} from '../utils/fillRateUx';

// Layer components
import SatelliteLayer from './cesium-globe/SatelliteLayer';
import AircraftLayer from './cesium-globe/AircraftLayer';
import VesselLayer from './cesium-globe/VesselLayer';
import IssLayer from './cesium-globe/IssLayer';
import SnpLayer from './cesium-globe/SnpLayer';
import CoverageLayer, { GEO_COVERAGE_ENTITY_PREFIX, type GeoCoverageLegendItem } from './cesium-globe/CoverageLayer';
import OneWebCombLayer from './cesium-globe/OneWebCombLayer';
import AggregatedCoverageVolumeLayer, { type ProjectionCoverageGroup } from './cesium-globe/AggregatedCoverageVolumeLayer';
import TransmissionLinks from './cesium-globe/TransmissionLinks';
import TrajectoryLayer from './cesium-globe/TrajectoryLayer';
import GeoGatewayLayer from './cesium-globe/GeoGatewayLayer';
import GeoGroundSiteLegend from './cesium-globe/GeoGroundSiteLegend';
import AggregatedConnectivityLayer from './cesium-globe/AggregatedConnectivityLayer';
import FillRateLayer, { FillRateLegend } from './cesium-globe/FillRateLayer';
import RegulatoryLayer from './cesium-globe/RegulatoryLayer';
import FiveGSpectrumLayer from './cesium-globe/FiveGSpectrumLayer';
import SelectedCountryOutline from './cesium-globe/SelectedCountryOutline';
import SelectedPointStatusMarker, { SelectionPulseMarker } from './cesium-globe/SelectedPointStatusMarker';
import { usePositionCallbacks } from './cesium-globe/hooks';

// UI components
import GlobeIntelligenceRail from './cesium-globe/GlobeIntelligenceRail';
import GeoCoverageLegendPanel from './cesium-globe/GeoCoverageLegendPanel';
import PositionDisplay from './cesium-globe/PositionDisplay';
import SatelliteIndicator from './cesium-globe/SatelliteIndicator';
import InspectionCard, { type HoveredEntity } from './cesium-globe/InspectionCard';
import CountryOverlayLegend from './cesium-globe/CountryOverlayLegend';
import SiteScreenLabel from './cesium-globe/SiteScreenLabel';
import SatelliteScreenLabels from './cesium-globe/SatelliteScreenLabels';
import LeoS2SPathStrip from './cesium-globe/LeoS2SPathStrip';
import GeoS2SPathStrip from './cesium-globe/GeoS2SPathStrip';
import {
  buildGeoStarSection,
  buildGeoMeshSection,
  buildLeoSingleSection,
  buildLeoS2SSectionA,
  buildLeoS2SSectionB,
} from './cesium-globe/siteTooltipHelpers';
import MoonLayer from './cesium-globe/MoonLayer';
import { GEO_GATEWAYS, SNPS_DATA, type GeoGatewayData, type SNPData } from './globe/GlobeConfig';
import type { ResolvedGeoGateway } from '../utils/geoConnectivityModel';
import { getCoverageGroupId } from '../utils/geoCoverageSelection';
import { isOperationalSatellite } from '../utils/satelliteStatus';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { GeoPointStatus } from '../utils/selectedPointStatus';
import type { SNPConnectedSatellite } from '../services/coverageService';
import { GROUND_POINT_ALTITUDE_KM } from './cesium-globe/layerHeights';
import CoverageSwitcherVertical, { type CoverageSwitcherCoverage } from './CoverageSwitcherVertical';
import type { CountryOverlayMode } from '../types/countryOverlays';
import type { LinkMode } from '../types/linkMode';
import type { LeoSiteToSiteResult } from '../utils/leoSiteToSiteModel';
import type { CommercialScenarioViewModel } from './commercial/commercialViewModel';
import type { CommercialRouteModel, CommercialRouteNodeType, CommercialRouteFocusTarget, CommercialRouteSegmentId, RouteCoordinate } from '../types/commercialRouteModel';
import CommercialSymbolicConnectivityLayer from './cesium-globe/CommercialSymbolicConnectivityLayer';
import FlightCoverageRibbon from './cesium-globe/FlightCoverageRibbon';

// ─── Commercial vocabulary helpers ───────────────────────────────────────────

type CommercialSegmentStatus = 'healthy' | 'warning' | 'blocked' | 'unknown';

/**
 * Map a CommercialRouteSegmentStatus to a commercial-facing label and
 * a SiteScreenLabel tone.  Used by site tooltips in Commercial Mode so the
 * globe never surfaces raw engineering vocabulary like "DEGRADED" or "RTT".
 */
function commercialSegmentDisplay(status: CommercialSegmentStatus | undefined): {
    tone: 'success' | 'warning' | 'danger' | 'neutral';
    label: string;
} {
    switch (status) {
        case 'healthy': return { tone: 'success', label: 'Available' };
        case 'warning': return { tone: 'warning', label: 'Limited Service' };
        case 'blocked': return { tone: 'danger',  label: 'Unavailable' };
        default:        return { tone: 'neutral', label: 'Checking Coverage' };
    }
}

const formatCommercialFrequencyBand = (band: CandidateCoverage['band'] | undefined): string | null => (
    band ? `${band} Band` : null
);

// ─── Commercial route camera helpers ─────────────────────────────────────────
// Narrative altitudes used by commercial camera framing.
const COMM_GEO_ALT_KM = 20_000;
const COMM_LEO_ALT_KM = 2_000;

interface CommercialGeoCoverageFocusFrame {
    sphere: BoundingSphere;
    pitchRadians: number;
}

const normalizeLngNear = (lng: number, referenceLng: number): number => {
    let normalized = lng;
    while (normalized - referenceLng > 180) normalized -= 360;
    while (normalized - referenceLng < -180) normalized += 360;
    return normalized;
};

const denormalizeLng = (lng: number): number => {
    let normalized = lng;
    while (normalized > 180) normalized -= 360;
    while (normalized < -180) normalized += 360;
    return normalized;
};

function sameCommercialRouteCoordinate(a: RouteCoordinate, b: RouteCoordinate): boolean {
    return Math.abs(a.lat - b.lat) < 0.0001
        && Math.abs(normalizeLngNear(a.lng, b.lng) - b.lng) < 0.0001;
}

function averageCommercialRouteCoordinate(coords: RouteCoordinate[]): RouteCoordinate | null {
    if (coords.length === 0) return null;
    const referenceLng = coords[0].lng;
    const lat = coords.reduce((sum, coord) => sum + coord.lat, 0) / coords.length;
    const lng = denormalizeLng(
        coords.reduce((sum, coord) => sum + normalizeLngNear(coord.lng, referenceLng), 0) / coords.length,
    );
    return { lat, lng };
}

function uniqueCommercialRouteCoordinates(coords: RouteCoordinate[]): RouteCoordinate[] {
    return coords.filter((coord, index, array) => (
        array.findIndex((item) => sameCommercialRouteCoordinate(item, coord)) === index
    ));
}

function buildCommercialLeoPresentationSatelliteCoord(
    originalCoord: RouteCoordinate,
    servingEndpoints: RouteCoordinate[],
    allEndpoints: RouteCoordinate[],
): RouteCoordinate {
    const routeCenter = averageCommercialRouteCoordinate(allEndpoints);
    if (!routeCenter || servingEndpoints.length === 0) {
        return {
            ...originalCoord,
            altitudeKm: Math.max(760, Math.min(1_300, originalCoord.altitudeKm ?? 1_050)),
        };
    }

    const anchor = averageCommercialRouteCoordinate(servingEndpoints) ?? servingEndpoints[0];
    const normalizedCenterLng = normalizeLngNear(routeCenter.lng, anchor.lng);
    const endpointBlend = servingEndpoints.length > 1 ? 0.52 : 0.38;
    const originalBlend = servingEndpoints.length > 1 ? 0.12 : 0.08;
    const normalizedOriginalLng = normalizeLngNear(originalCoord.lng, anchor.lng);

    return {
        lat: anchor.lat
            + (routeCenter.lat - anchor.lat) * endpointBlend
            + (originalCoord.lat - anchor.lat) * originalBlend,
        lng: denormalizeLng(
            anchor.lng
            + (normalizedCenterLng - anchor.lng) * endpointBlend
            + (normalizedOriginalLng - anchor.lng) * originalBlend,
        ),
        altitudeKm: Math.max(820, Math.min(1_180, originalCoord.altitudeKm ?? 1_050)),
    };
}

function getCommercialLeoProjectionOrigin(
    routeModel: CommercialRouteModel | null | undefined,
    satellite: SatelliteData,
): RouteCoordinate | null {
    if (!routeModel || routeModel.technology !== 'LEO') return null;

    const skyBridgeNode = routeModel.nodes.find((node) => (
        node.nodeType === 'SKY_BRIDGE'
        && node.meta?.technology === 'LEO'
        && (
            node.meta.satelliteId === satellite.id
            || node.meta.satelliteNoradId === satellite.noradId
            || node.label === satellite.name
        )
        && node.meta.orbitalPosition
    ));
    const originalCoord = skyBridgeNode?.meta?.orbitalPosition;
    if (!skyBridgeNode || !originalCoord) return null;

    const endpointNodes = routeModel.nodes.filter((node) => (
        (node.nodeType === 'ORIGIN' || node.nodeType === 'DESTINATION' || node.nodeType === 'NETWORK_PORTAL')
        && node.position
    ));
    const endpointById = new Map(endpointNodes.map((node) => [node.id, node.position!]));
    const allEndpoints = uniqueCommercialRouteCoordinates(endpointNodes.map((node) => node.position!));
    const servingEndpoints = uniqueCommercialRouteCoordinates(routeModel.edges
        .filter((edge) => edge.edgeType === 'SPACE_LINK' && (edge.fromNodeId === skyBridgeNode.id || edge.toNodeId === skyBridgeNode.id))
        .map((edge) => edge.fromNodeId === skyBridgeNode.id ? endpointById.get(edge.toNodeId) : endpointById.get(edge.fromNodeId))
        .filter((coord): coord is RouteCoordinate => Boolean(coord)));

    return buildCommercialLeoPresentationSatelliteCoord(originalCoord, servingEndpoints, allEndpoints);
}

const isFiniteLngLatPair = (value: unknown): value is [number, number] => (
    Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
);

const collectFeatureLngLatPairs = (feature: Feature<Geometry, GeoJsonProperties> | null | undefined): Array<[number, number]> => {
    const geometry = feature?.geometry;
    if (!geometry) return [];

    if (geometry.type === 'Polygon') {
        return (geometry.coordinates ?? [])
            .flatMap((ring) => ring.filter(isFiniteLngLatPair).map(([lng, lat]) => [lng, lat] as [number, number]));
    }

    if (geometry.type === 'MultiPolygon') {
        return (geometry.coordinates ?? [])
            .flatMap((polygon) => polygon)
            .flatMap((ring) => ring.filter(isFiniteLngLatPair).map(([lng, lat]) => [lng, lat] as [number, number]));
    }

    return [];
};

const getCoverageSourceKey = (coverageKey: string): string => coverageKey.replace(/::synth-(ul|dl)$/, '');

function buildCommercialGeoCoverageFocusFrame(
    satellites: SatelliteData[],
    selectedPosition: { lat: number; lng: number; altitude?: number } | null,
    candidates: Array<CandidateCoverage | null | undefined>,
): CommercialGeoCoverageFocusFrame | null {
    const coordinatePairs: Array<[number, number]> = [];
    const seenCoverageKeys = new Set<string>();

    for (const candidate of candidates) {
        if (!candidate) continue;
        const sourceKey = getCoverageSourceKey(candidate.coverageKey);
        const candidateKey = `${candidate.satelliteId}::${sourceKey}`;
        if (seenCoverageKeys.has(candidateKey)) continue;
        seenCoverageKeys.add(candidateKey);

        const satellite = satellites.find((item) => item.id === candidate.satelliteId && item.type === 'EUTELSAT');
        if (!satellite) continue;

        for (const coverage of satellite.coverages) {
            if (getCoverageGroupId(coverage) !== sourceKey) continue;
            coordinatePairs.push(...collectFeatureLngLatPairs(coverage.feature as Feature<Geometry, GeoJsonProperties>));
        }
    }

    if (coordinatePairs.length === 0) return null;

    const referenceLng = selectedPosition?.lng ?? coordinatePairs[0][0];
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const [lng, lat] of coordinatePairs) {
        const normalizedLng = normalizeLngNear(lng, referenceLng);
        minLng = Math.min(minLng, normalizedLng);
        maxLng = Math.max(maxLng, normalizedLng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
    }

    if (!Number.isFinite(minLng) || !Number.isFinite(maxLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
        return null;
    }

    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const framePoints: Array<[number, number]> = [
        [minLng, minLat],
        [minLng, maxLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [centerLng, centerLat],
    ];

    if (selectedPosition) {
        framePoints.push([normalizeLngNear(selectedPosition.lng, referenceLng), selectedPosition.lat]);
    }

    const positions = framePoints.map(([lng, lat]) => (
        getPosition(lat, denormalizeLng(lng), GROUND_POINT_ALTITUDE_KM)
    ));
    const sphere = BoundingSphere.fromPoints(positions);
    sphere.radius = Math.max(sphere.radius * 1.16, 900_000);

    return {
        sphere,
        pitchRadians: -CesiumMath.toRadians(34),
    };
}

function executeGeoSurfaceFallbackCamera(
    viewer: CesiumViewerType,
    model: CommercialRouteModel,
): void {
    const positions: Cartesian3[] = [];
    const groundTypes: CommercialRouteNodeType[] = ['ORIGIN', 'DESTINATION', 'NETWORK_PORTAL'];

    for (const n of model.nodes) {
        if (groundTypes.includes(n.nodeType) && n.position) {
            positions.push(getPosition(n.position.lat, n.position.lng, GROUND_POINT_ALTITUDE_KM));
        }
    }
    const arcApex = commercialSymbolicArcApex(model);
    if (arcApex) positions.push(arcApex);

    if (positions.length === 0) return;
    const sphere = BoundingSphere.fromPoints(positions);
    sphere.radius = Math.max(sphere.radius * 1.25, 1_200_000);
    viewer.camera.flyToBoundingSphere(
        sphere,
        { duration: 1.8, offset: new HeadingPitchRange(0, -CesiumMath.toRadians(32), 0) },
    );
}

/**
 * Compute a Cartesian3 position for a route node, handling both ground nodes
 * (use stored position at ground altitude) and SKY_BRIDGE nodes (compute
 * narrative midpoint at technology-appropriate altitude).
 */
function commercialNarrativePos(nodeId: string, model: CommercialRouteModel): Cartesian3 | null {
    const node = model.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    if (node.position) {
        return getPosition(node.position.lat, node.position.lng, GROUND_POINT_ALTITUDE_KM);
    }

    if (node.nodeType === 'SKY_BRIDGE') {
        const connected = model.edges.filter(
            e => e.edgeType === 'SPACE_LINK' && (e.fromNodeId === nodeId || e.toNodeId === nodeId),
        );
        const groundCoords: { lat: number; lng: number }[] = [];
        for (const edge of connected) {
            const otherId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
            const other = model.nodes.find(n => n.id === otherId);
            if (other?.position) groundCoords.push(other.position);
        }
        if (groundCoords.length === 0) return null;
        const lat = groundCoords.reduce((s, p) => s + p.lat, 0) / groundCoords.length;
        const lng = groundCoords.reduce((s, p) => s + p.lng, 0) / groundCoords.length;
        const altKm = model.technology === 'GEO' ? COMM_GEO_ALT_KM : COMM_LEO_ALT_KM;
        return getPosition(lat, lng, altKm);
    }

    return null;
}

function commercialSurfaceRouteNodes(model: CommercialRouteModel): Array<{ lat: number; lng: number }> {
    return model.nodes
        .filter((node) => (
            node.nodeType === 'ORIGIN'
            || node.nodeType === 'DESTINATION'
            || node.nodeType === 'NETWORK_PORTAL'
        ) && node.position)
        .map((node) => node.position!);
}

function commercialApproxDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const earthRadiusKm = 6371;
    const lat1 = CesiumMath.toRadians(a.lat);
    const lat2 = CesiumMath.toRadians(b.lat);
    const dLat = CesiumMath.toRadians(b.lat - a.lat);
    const dLng = CesiumMath.toRadians(normalizeLngNear(b.lng, a.lng) - a.lng);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function commercialSymbolicArcApex(model: CommercialRouteModel): Cartesian3 | null {
    const surface = commercialSurfaceRouteNodes(model);
    if (surface.length < 2) return null;
    const origin = surface[0];
    const destination = surface[surface.length - 1];
    const normalizedDestinationLng = normalizeLngNear(destination.lng, origin.lng);
    const lat = (origin.lat + destination.lat) / 2;
    const lng = denormalizeLng((origin.lng + normalizedDestinationLng) / 2);
    const distanceKm = commercialApproxDistanceKm(origin, destination);
    const peakKm = Math.min(
        model.technology === 'GEO' ? 2100 : 1400,
        Math.max(model.technology === 'GEO' ? 750 : 500, distanceKm * 0.17),
    );
    return getPosition(lat, lng, GROUND_POINT_ALTITUDE_KM + 18 + peakKm);
}

function commercialRouteBearingRadians(model: CommercialRouteModel): number {
    const surface = commercialSurfaceRouteNodes(model);
    if (surface.length < 2) return 0;

    const origin = surface[0];
    const destination = surface[surface.length - 1];
    const lat1 = CesiumMath.toRadians(origin.lat);
    const lat2 = CesiumMath.toRadians(destination.lat);
    const dLng = CesiumMath.toRadians(normalizeLngNear(destination.lng, origin.lng) - origin.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2)
        - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return Math.atan2(y, x);
}

function commercialRouteGeometrySignature(model: CommercialRouteModel): string {
    return model.nodes
        .filter((node) => node.position)
        .map((node) => {
            const { lat, lng, altitudeKm } = node.position!;
            return [
                node.id,
                lat.toFixed(5),
                lng.toFixed(5),
                (altitudeKm ?? 0).toFixed(2),
            ].join('@');
        })
        .join('|');
}

function commercialCustomerEndpointGeometrySignature(model: CommercialRouteModel): string {
    return model.nodes
        .filter((node) => (
            node.nodeType === 'ORIGIN'
            || node.nodeType === 'DESTINATION'
        ) && node.position)
        .map((node) => {
            const { lat, lng, altitudeKm } = node.position!;
            return [
                node.nodeType,
                lat.toFixed(5),
                lng.toFixed(5),
                (altitudeKm ?? 0).toFixed(2),
            ].join('@');
        })
        .join('|');
}

function commercialCameraFocusGeometrySignature(
    model: CommercialRouteModel,
    segmentId: CommercialRouteSegmentId | 'summary',
): string {
    if (model.technology === 'LEO' && segmentId === 'satellite') {
        return [
            model.technology,
            model.destinationIsPortal ? 'portal' : 'site-to-site',
            commercialCustomerEndpointGeometrySignature(model),
        ].join(':');
    }

    return commercialRouteGeometrySignature(model);
}

function removeCommercialSymbolicConnectivityEntities(viewer: CesiumViewerType): void {
    const entities = [...viewer.entities.values];
    for (const entity of entities) {
        const id = entity.id;
        if (typeof id === 'string' && id.startsWith('commercial-route-') && id.includes('-symbolic-')) {
            viewer.entities.remove(entity);
        }
    }
}

function executeGeoCoverageServiceCamera(
    viewer: CesiumViewerType,
    model: CommercialRouteModel,
    geoCoverageFocusFrame: CommercialGeoCoverageFocusFrame,
): void {
    const positions: Cartesian3[] = [];
    const groundTypes: CommercialRouteNodeType[] = ['ORIGIN', 'DESTINATION', 'NETWORK_PORTAL'];

    for (const n of model.nodes) {
        if (groundTypes.includes(n.nodeType) && n.position) {
            positions.push(getPosition(n.position.lat, n.position.lng, GROUND_POINT_ALTITUDE_KM));
        }
    }

    const arcApex = commercialSymbolicArcApex(model);
    if (arcApex) positions.push(arcApex);
    positions.push(geoCoverageFocusFrame.sphere.center);

    if (positions.length < 2) {
        viewer.camera.flyToBoundingSphere(
            geoCoverageFocusFrame.sphere,
            { duration: 1.8, offset: new HeadingPitchRange(0, geoCoverageFocusFrame.pitchRadians, 0) },
        );
        return;
    }

    const sphere = BoundingSphere.fromPoints(positions);
    sphere.radius = Math.min(Math.max(sphere.radius * 1.05, 850_000), 2_600_000);
    const range = Math.min(Math.max(sphere.radius * 2.05, 1_450_000), 5_400_000);

    viewer.camera.flyToBoundingSphere(
        sphere,
        {
            duration: 1.8,
            offset: new HeadingPitchRange(
                commercialRouteBearingRadians(model) + (Math.PI / 2),
                -CesiumMath.toRadians(46),
                range,
            ),
        },
    );
}

function executeCommercialMobileHeroCamera(
    viewer: CesiumViewerType,
    model: CommercialRouteModel,
    geoCoverageFocusFrame: CommercialGeoCoverageFocusFrame | null = null,
): void {
    const positions: Cartesian3[] = [];
    const surfaceTypes: CommercialRouteNodeType[] = ['ORIGIN', 'DESTINATION', 'NETWORK_PORTAL'];

    for (const node of model.nodes) {
        if (surfaceTypes.includes(node.nodeType) && node.position) {
            positions.push(getPosition(node.position.lat, node.position.lng, GROUND_POINT_ALTITUDE_KM));
        }
    }

    const arcApex = commercialSymbolicArcApex(model);
    if (arcApex) positions.push(arcApex);

    if (model.technology === 'LEO') {
        for (const edge of model.edges) {
            if (edge.edgeType !== 'SPACE_LINK') continue;
            const fromPosition = commercialNarrativePos(edge.fromNodeId, model);
            const toPosition = commercialNarrativePos(edge.toNodeId, model);
            if (fromPosition) positions.push(fromPosition);
            if (toPosition) positions.push(toPosition);
        }
    }

    if (positions.length === 0) {
        if (model.technology === 'GEO' && geoCoverageFocusFrame) {
            viewer.camera.flyToBoundingSphere(
                geoCoverageFocusFrame.sphere,
                { duration: 1.25, offset: new HeadingPitchRange(0, geoCoverageFocusFrame.pitchRadians, 0) },
            );
        }
        return;
    }

    const sphere = positions.length === 1
        ? new BoundingSphere(positions[0], model.technology === 'GEO' ? 1_250_000 : 950_000)
        : BoundingSphere.fromPoints(positions);
    sphere.radius = Math.min(Math.max(sphere.radius * 1.08, 1_050_000), 4_200_000);
    const range = Math.min(Math.max(sphere.radius * 1.65, 1_600_000), 7_200_000);
    const composeAboveDecisionCard = () => {
        viewer.camera.moveDown(Math.min(Math.max(range * 0.16, 260_000), 920_000));
        viewer.camera.moveBackward(Math.min(Math.max(range * 0.08, 120_000), 520_000));
        viewer.scene.requestRender();
    };

    viewer.camera.flyToBoundingSphere(
        sphere,
        {
            duration: 1.25,
            offset: new HeadingPitchRange(
                commercialRouteBearingRadians(model) + (Math.PI / 2),
                -CesiumMath.toRadians(48),
                range,
            ),
            complete: composeAboveDecisionCard,
        },
    );
}

/**
 * Execute a camera fly to match the given CommercialRouteFocusTarget behaviour.
 *
 * FRAME_NODE      — close endpoint emphasis for the selected customer/destination site
 * FRAME_ARC       — frame the symbolic service arc and footprint context
 * FRAME_BACKBONE  — medium route framing with simplified transit context
 * FRAME_ROUTE     — overview of endpoints and symbolic service arc
 */
function executeCommercialFocusCamera(
    viewer: CesiumViewerType,
    focusTarget: CommercialRouteFocusTarget,
    model: CommercialRouteModel,
    geoCoverageFocusFrame: CommercialGeoCoverageFocusFrame | null = null,
): void {
    const { behaviour, primaryNodeId, secondaryNodeId } = focusTarget;

    if (behaviour === 'FRAME_NODE' && primaryNodeId) {
        const primaryNode = model.nodes.find((node) => node.id === primaryNodeId);
        const primaryPosition = primaryNode?.position;
        const pos = primaryPosition
            ? getPosition(primaryPosition.lat, primaryPosition.lng, GROUND_POINT_ALTITUDE_KM)
            : commercialNarrativePos(primaryNodeId, model);
        if (!pos) return;
        const sphere = new BoundingSphere(pos, 160_000);
        viewer.camera.flyToBoundingSphere(
            sphere,
            { duration: 1.35, offset: new HeadingPitchRange(0, -CesiumMath.toRadians(58), 650_000) },
        );
        return;
    }

    if (behaviour === 'FRAME_ARC') {
        if (model.technology === 'GEO') {
            executeGeoSurfaceFallbackCamera(viewer, model);
            return;
        }

        // LEO FRAME_ARC needs extra breathing room so the OneWeb footprint fans stay visible.
        // Frame all route points, but bias the look-at target toward the surface footprints.
        const skyBridgePositions: Cartesian3[] = [];
        const groundPositions: Cartesian3[] = [];
        if (primaryNodeId) {
            const p = commercialNarrativePos(primaryNodeId, model);
            if (p) skyBridgePositions.push(p);
        }
        if (secondaryNodeId) {
            const p = commercialNarrativePos(secondaryNodeId, model);
            if (p) skyBridgePositions.push(p);
        }
        const groundTypes: CommercialRouteNodeType[] = ['ORIGIN', 'DESTINATION', 'NETWORK_PORTAL'];
        for (const n of model.nodes) {
            if (groundTypes.includes(n.nodeType) && n.position) {
                groundPositions.push(getPosition(n.position.lat, n.position.lng, GROUND_POINT_ALTITUDE_KM));
            }
        }
        const positions = [...skyBridgePositions, ...groundPositions];
        if (positions.length === 0) return;
        const leoArcSphere = BoundingSphere.fromPoints(positions);
        if (skyBridgePositions.length > 0 && groundPositions.length > 0) {
            const footprintSphere = BoundingSphere.fromPoints(groundPositions);
            const footprintBiasedCenter = Cartesian3.lerp(
                leoArcSphere.center,
                footprintSphere.center,
                0.62,
                new Cartesian3(),
            );
            leoArcSphere.center = footprintBiasedCenter;
            leoArcSphere.radius = positions.reduce(
                (radius, position) => Math.max(radius, Cartesian3.distance(footprintBiasedCenter, position)),
                footprintSphere.radius,
            );
        }
        leoArcSphere.radius = Math.min(Math.max(leoArcSphere.radius * 1.12, 1_300_000), 4_650_000);
        const range = Math.min(Math.max(leoArcSphere.radius * 1.74, 2_250_000), 7_900_000);
        viewer.camera.flyToBoundingSphere(
            leoArcSphere,
            {
                duration: 1.55,
                offset: new HeadingPitchRange(
                    commercialRouteBearingRadians(model) + (Math.PI / 2),
                    -CesiumMath.toRadians(42),
                    range,
                ),
            },
        );
        return;
    }

    if (behaviour === 'FRAME_GEO_COVERAGE') {
        if (geoCoverageFocusFrame) {
            executeGeoCoverageServiceCamera(viewer, model, geoCoverageFocusFrame);
            return;
        }

        executeGeoSurfaceFallbackCamera(viewer, model);
        return;
    }

    if (behaviour === 'FRAME_BACKBONE') {
        const positions: Cartesian3[] = [];
        for (const n of model.nodes) {
            if ((n.nodeType === 'ORIGIN' || n.nodeType === 'DESTINATION' || n.nodeType === 'NETWORK_PORTAL') && n.position) {
                positions.push(getPosition(n.position.lat, n.position.lng, GROUND_POINT_ALTITUDE_KM));
            }
        }
        const arcApex = commercialSymbolicArcApex(model);
        if (arcApex) positions.push(arcApex);
        for (const n of model.nodes) {
            if (n.nodeType === 'HUB' && n.position) {
                positions.push(getPosition(n.position.lat, n.position.lng, GROUND_POINT_ALTITUDE_KM));
            }
        }
        if (primaryNodeId) {
            const p = commercialNarrativePos(primaryNodeId, model);
            if (p) positions.push(p);
        }
        if (secondaryNodeId) {
            const p = commercialNarrativePos(secondaryNodeId, model);
            if (p) positions.push(p);
        }
        if (positions.length === 0) return;
        const sphere = BoundingSphere.fromPoints(positions);
        sphere.radius = Math.max(sphere.radius * 1.12, 1_800_000);
        viewer.camera.flyToBoundingSphere(
            sphere,
            { duration: 1.5, offset: new HeadingPitchRange(0, -CesiumMath.toRadians(34), 0) },
        );
        return;
    }

    // FRAME_ROUTE — summary view centred on the business route, not empty sky.
    const primarySurfaceTypes: CommercialRouteNodeType[] = ['ORIGIN', 'DESTINATION', 'NETWORK_PORTAL'];
    const groundPositions: Cartesian3[] = [];

    for (const n of model.nodes) {
        if (primarySurfaceTypes.includes(n.nodeType) && n.position) {
            groundPositions.push(getPosition(n.position.lat, n.position.lng, GROUND_POINT_ALTITUDE_KM));
        }
    }
    if (groundPositions.length === 0) return;

    const arcApex = commercialSymbolicArcApex(model);
    const routeFramingPositions = arcApex ? [...groundPositions, arcApex] : groundPositions;

    const routeSphere = BoundingSphere.fromPoints(routeFramingPositions);
    routeSphere.radius = Math.max(routeSphere.radius * 1.06, 850_000);
    viewer.camera.flyToBoundingSphere(
        routeSphere,
        { duration: 1.5, offset: new HeadingPitchRange(0, -CesiumMath.toRadians(40), 0) },
    );
}

// ─────────────────────────────────────────────────────────────────────────────

const BASEMAP_STORAGE_KEY = 'cesium:basemap';
const FALLBACK_BASEMAP_ID = 'natural-earth-ii';

const normalizeBasemapName = (value: string) =>
    value.replace(/\u00ad/g, '').replace(/\u00a0/g, ' ').trim();

const DESIRED_BASEMAPS = [
    { id: 'bing-aerial', name: 'Bing Maps Aerial', label: 'Bing Aerial' },
    { id: 'bing-aerial-labels', name: 'Bing Maps Aerial with Labels', label: 'Bing Aerial + Labels' },
    { id: 'bing-roads', name: 'Bing Maps Roads', label: 'Bing Roads' },
    { id: 'arcgis-imagery', name: 'ArcGIS World Imagery', label: 'ArcGIS Imagery' },
    { id: 'openstreetmap', name: 'OpenStreetMap', label: 'OpenStreetMap' },
    { id: 'sentinel-2', name: 'Sentinel-2', label: 'Sentinel-2' },
    { id: 'blue-marble', name: 'Blue Marble', label: 'Blue Marble' },
    { id: 'earth-at-night', name: 'Earth at night', label: 'Earth at Night' },
    { id: 'natural-earth-ii', name: 'Natural Earth II', label: 'Natural Earth II' },
] as const;

type BasemapOption = {
    id: string;
    label: string;
    viewModel: ProviderViewModel;
};

const getPickedObjectId = (pickedObject: unknown): string => {
    if (!pickedObject || typeof pickedObject !== 'object' || !('id' in pickedObject)) return '';

    const id = (pickedObject as { id?: unknown }).id;
    if (typeof id === 'string') return id;
    if (id && typeof id === 'object' && 'id' in id) {
        const nestedId = (id as { id?: unknown }).id;
        return typeof nestedId === 'string' ? nestedId : '';
    }

    return '';
};

const getHoverKeyFromPickedObject = (pickedObject: unknown): string | null => {
    const pickedId = getPickedObjectId(pickedObject);
    if (!pickedId) return null;

    if (pickedId.startsWith('satellite-')) {
        return `satellite:${pickedId.slice('satellite-'.length)}`;
    }
    if (pickedId.startsWith('aircraft-')) {
        return `aircraft:${pickedId.slice('aircraft-'.length)}`;
    }
    if (pickedId.startsWith('vessel-')) {
        return `vessel:${pickedId.slice('vessel-'.length)}`;
    }
    if (pickedId.startsWith('snp-')) {
        return `snp:${pickedId.slice('snp-'.length)}`;
    }
    if (pickedId.startsWith('gateway-')) {
        return `gateway:${pickedId.slice('gateway-'.length)}`;
    }

    return null;
};

export interface DisplayPrefsProps {
    enableLighting?: boolean;
    showSatelliteTrajectory?: boolean;
    showAggregatedConnectivity?: boolean;
    showFillRateLayer?: boolean;
    showFootprintProjection?: boolean;
    showFlowAnimation?: boolean;
    sizeScale?: number;
    hideSatelliteScreenLabels?: boolean;
    hideSiteScreenLabels?: boolean;
    hideBottomPathStrip?: boolean;
    /** True while the map is shrunk to the Engineering Analysis split-layout strip (~22-24% height). Compacts chrome that assumes a full-height map. */
    isCompactMap?: boolean;
    simplifySatellitesForEngineeringAnalysis?: boolean;
    isPhone?: boolean;
    isMobileViewport?: boolean;
    isFullscreen: boolean;
    countryOverlayMode?: CountryOverlayMode;
}

export interface IssStateProps {
    issLiveEnabled?: boolean;
    issPositionRef?: React.RefObject<IssPosition | null>;
    issOrbitPath?: IssOrbitPath | null;
    issHasPosition?: boolean;
    issIsSelected?: boolean;
    issIsFollowing?: boolean;
}

export interface CommercialStateProps {
    commercialMode?: boolean;
    commercialViewModel?: CommercialScenarioViewModel | null;
    /** Canonical route model (COMM-6C3B+). When present, drives SKY_BRIDGE
     *  rendering, focus synchronisation, and node-click routing. */
    commercialRouteModel?: CommercialRouteModel | null;
    /** Temporary display preview: swap overlays without moving the camera. */
    suppressCommercialCameraFocus?: boolean;
}

export interface AirTrafficStateProps {
    airTrafficEnabled?: boolean;
    aircraft?: Aircraft[];
    interpolatedAircraftMapRef?: React.MutableRefObject<Map<string, AircraftInterpolation>>;
}

export interface MaritimeTrafficStateProps {
    maritimeTrafficEnabled?: boolean;
    vessels?: Vessel[];
    interpolatedVesselMapRef?: React.MutableRefObject<Map<string, VesselInterpolation>>;
}

export interface SatelliteRuntimeProps {
    satellites: SatelliteData[];
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    autoSelectedLEOSatellite: SatelliteData | null;
    autoSelectedLEOSatelliteB: SatelliteData | null;
    snpConnectedSatellites: SNPConnectedSatellite[];
    leoSiteToSiteResult: LeoSiteToSiteResult | null;
    leoSiteToSiteFullResult: LeoSiteToSiteResult | null;
    leoServiceViewModel: LeoConnectivityViewModel | null;
}

export interface SelectionAnalysisProps {
    selectedPosition: { lat: number; lng: number; altitude?: number } | null;
    selectedSatellite: SatelliteData | null;
    selectedMoon: boolean;
    autoSelectedGEOSatellite: SatelliteData | null;
    selectedGEOBeam: GEOBeam | null;
    selectedCoverage: CandidateCoverage | null;
    selectedUplinkCoverage: CandidateCoverage | null;
    selectedDownlinkCoverage: CandidateCoverage | null;
    selectedSNP: { lat: number; lng: number; name: string } | null;
    selectedGateway: GeoGatewayData | null;
    inspectedSNP: SNPData | null;
    dedicatedSNPForSelectedLEO: SNPData | null;
    geoPointStatus: GeoPointStatus | null;
    selectedRegulatoryResult: RegulatoryResult | null;
    performanceMetrics: MobileAnalysisMetrics | null;
    activeConnectivityTab: 'LEO' | 'GEO';
    coverageSwitcherCoverages: CoverageSwitcherCoverage[];
    selectedCoverageId: string;
    visibleGeoCoverageKeys: string[] | undefined;
    selection: Selection;
    endpointSelectionMotion?: {
        role: 'origin' | 'destination';
        token: number;
    } | null;
}

export interface DisplayLayerProps {
    displayPrefs: DisplayPrefsProps;
    satelliteScope: SatelliteScope;
}

export interface TrafficProps {
    airTrafficState: AirTrafficStateProps;
    selectedAircraft: Aircraft | null;
    maritimeTrafficState: MaritimeTrafficStateProps;
    selectedVessel: Vessel | null;
    issState: IssStateProps;
}

export interface TopologyProps {
    pointB: { lat: number; lng: number } | null;
    pointBLeo: { lat: number; lng: number } | null;
    linkMode: LinkMode;
    activeMeshTab: 'forward' | 'reverse';
}

export interface CameraViewBounds {
    north: number;
    south: number;
    east: number;
    west: number;
    centerLat: number;
    centerLng: number;
}

export interface CameraProps {
    cameraTarget: { lat: number; lng: number; alt: number } | null;
    onCameraReady: (viewer: CesiumViewerType) => void;
    onGlobeContainerReady: (ref: React.RefObject<HTMLDivElement | null>) => void;
    onGlobeBootPhaseChange: (phase: 'mounting' | 'viewer-ready' | 'imagery-ready') => void;
    onInitialGlobeReady: () => void;
    /** Fired on camera moveEnd (debounced 400 ms) with the current viewport bounds in degrees. */
    onCameraViewChange?: (bounds: CameraViewBounds) => void;
}

export interface CallbackProps {
    onPointClick: (lat: number, lng: number, shiftKey: boolean) => void;
    onEmptyClick: (shiftKey: boolean) => void;
    onCoverageClick: (coverageKey: string) => void;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onMoonSelectionChange: (selected: boolean) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
    onSnpClick: (snpName: string | { lat: number; lng: number; name: string } | null) => void;
    onGatewayClick: (gatewayName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    onAircraftClick: (aircraft: Aircraft | null) => void;
    onAircraftHover: (aircraft: Aircraft | null) => void;
    onVesselClick: (vessel: Vessel | null) => void;
    onVesselHover: undefined;
    onIssClick: () => void;
    onToggleFullscreen: () => void;
    onToggleLighting: () => void;
    onToggleAggregatedConnectivity: () => void;
    onToggleFillRateLayer: () => void;
    onToggleFootprintProjection: () => void;
    onToggleFlowAnimation: () => void;
    onToggleSatelliteTrajectory: () => void;
    onToggleAirTraffic: () => void;
    onToggleMaritimeTraffic: () => void;
    onToggleIssLive: () => void;
    onCountryOverlayModeChange: (mode: CountryOverlayMode) => void;
    onSizeScaleChange: (scale: number) => void;
    onSizeScaleReset: () => void;
    onCoverageSwitcherSelect: (id: string) => void;
}

interface CesiumGlobeProps {
    satellites: SatelliteData[];
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    selectionAnalysisProps: SelectionAnalysisProps;
    callbackProps: CallbackProps;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedLEOSatelliteB?: SatelliteData | null;
    displayLayerProps: DisplayLayerProps;
    trafficProps: TrafficProps;
    cameraProps: CameraProps;
    sceneMode?: '2D' | '3D';
    onSceneModeChange?: (mode: '2D' | '3D') => void;
    snpConnectedSatellites?: import('../services/coverageService').SNPConnectedSatellite[];
    leoServiceViewModel?: LeoConnectivityViewModel | null;
    topologyProps: TopologyProps;
    /** LEO site-to-site result — when present, draws the full routed path on the globe. */
    leoSiteToSiteResult?: import('../utils/leoSiteToSiteModel').LeoSiteToSiteResult | null;
    /** Full S2S result with computed throughput/latency — used for floating tooltips and path strip. */
    leoSiteToSiteFullResult?: import('../utils/leoSiteToSiteModel').LeoSiteToSiteResult | null;
    commercialState: CommercialStateProps;
    onCommercialSelectedSegmentChange?: (segmentId: string) => void;
    /** GEO gateway resolved for the auto-selected GEO satellite. Computed in App.tsx. */
    resolvedAutoGeoGateway?: ResolvedGeoGateway | null;
    /** GEO gateway resolved for the manually selected GEO satellite. Computed in App.tsx. */
    resolvedSelectedGeoGateway?: ResolvedGeoGateway | null;
}

const CesiumGlobe: React.FC<CesiumGlobeProps> = ({
    satellites,
    satelliteTypeByName,
    coverageFeatures,
    selectionAnalysisProps,
    callbackProps,
    autoSelectedLEOSatellite,
    displayLayerProps,
    trafficProps,
    cameraProps,
    sceneMode = '3D',
    onSceneModeChange,
    snpConnectedSatellites = [],
    leoServiceViewModel = null,
    topologyProps,
    leoSiteToSiteResult = null,
    leoSiteToSiteFullResult = null,
    commercialState,
    onCommercialSelectedSegmentChange,
    resolvedAutoGeoGateway = null,
    resolvedSelectedGeoGateway = null,
}) => {
    const {
        onPointClick,
        onEmptyClick,
        onCoverageClick,
        onSatelliteClick,
        onMoonSelectionChange,
        onSatelliteHover,
        onSnpClick,
        onGatewayClick,
        onSnpHover,
        onAircraftClick,
        onAircraftHover,
        onVesselClick,
        onVesselHover,
        onIssClick,
        onToggleFullscreen,
        onToggleLighting,
        onToggleAggregatedConnectivity,
        onToggleFillRateLayer,
        onToggleFootprintProjection,
        onToggleFlowAnimation,
        onToggleSatelliteTrajectory,
        onToggleAirTraffic,
        onToggleMaritimeTraffic,
        onToggleIssLive,
        onCountryOverlayModeChange,
        onSizeScaleChange,
        onSizeScaleReset,
        onCoverageSwitcherSelect,
    } = callbackProps;
    const {
        selectedPosition,
        selectedSatellite,
        selectedMoon,
        autoSelectedGEOSatellite,
        selectedGEOBeam,
        selectedCoverage,
        selectedUplinkCoverage,
        selectedDownlinkCoverage,
        selectedSNP,
        selectedGateway,
        inspectedSNP,
        dedicatedSNPForSelectedLEO,
        geoPointStatus,
        selectedRegulatoryResult,
        performanceMetrics,
        activeConnectivityTab,
        coverageSwitcherCoverages,
        selectedCoverageId,
        visibleGeoCoverageKeys,
        selection,
        endpointSelectionMotion,
    } = selectionAnalysisProps;
    const {
        displayPrefs,
        satelliteScope,
    } = displayLayerProps;
    const {
        pointB,
        pointBLeo,
        linkMode,
        activeMeshTab,
    } = topologyProps;
    const {
        airTrafficState,
        selectedAircraft,
        maritimeTrafficState,
        selectedVessel,
        issState,
    } = trafficProps;
    const {
        cameraTarget,
        onCameraReady,
        onGlobeContainerReady,
        onGlobeBootPhaseChange,
        onInitialGlobeReady,
        onCameraViewChange,
    } = cameraProps;
    const {
        enableLighting = false,
        showSatelliteTrajectory = false,
        showAggregatedConnectivity = false,
        showFillRateLayer = false,
        showFootprintProjection = false,
        showFlowAnimation = true,
        sizeScale,
        hideSatelliteScreenLabels = false,
        hideSiteScreenLabels = false,
        isPhone,
        isMobileViewport = false,
        isFullscreen,
        countryOverlayMode = 'none',
    } = displayPrefs;
    const {
        issLiveEnabled = false,
        issPositionRef,
        issOrbitPath = null,
        issHasPosition = false,
        issIsSelected = false,
        issIsFollowing = false,
    } = issState;
    const {
        commercialMode = false,
        commercialViewModel = null,
        commercialRouteModel = null,
        suppressCommercialCameraFocus = false,
    } = commercialState;

    const {
        airTrafficEnabled = false,
        aircraft = [],
        interpolatedAircraftMapRef,
    } = airTrafficState;
    const {
        maritimeTrafficEnabled = false,
        vessels = [],
        interpolatedVesselMapRef,
    } = maritimeTrafficState;

    // Stable refs for click-handler lookups — avoids recreating handleMapClick
    // (and re-registering the Cesium ScreenSpaceEvent) when aircraft/vessels/satellites
    // change identity (aircraft at 60fps when air traffic + interpolation is active).
    const aircraftRef = useRef<Aircraft[]>([]);
    aircraftRef.current = aircraft;
    const vesselsRef = useRef<Vessel[]>([]);
    vesselsRef.current = vessels;
    const satellitesRef = useRef<SatelliteData[]>([]);
    satellitesRef.current = satellites;

    const [imageryThemeRevision, setImageryThemeRevision] = useState(0);
    const [hoveredEntity, setHoveredEntity] = useState<HoveredEntity>(null);
    const [geoCoverageLegendItems, setGeoCoverageLegendItems] = useState<GeoCoverageLegendItem[]>([]);
    const [focusedGeoCoverageLegendKey, setFocusedGeoCoverageLegendKey] = useState<string | null>(null);
    const hoveredEntityKeyRef = useRef<string | null>(null);
    const inspectionCursorPositionRef = useRef<{ x: number; y: number } | null>(null);
    const cameraMetricsRef = useRef<CameraMetricsSnapshot>({
        position: new Cartesian3(),
        height: 20000000,
    });
    const emptyIssPositionRef = useRef<IssPosition | null>(null);
    const viewerRef = useRef<CesiumViewerType | null>(null);
    const globeContainerRef = useRef<HTMLDivElement>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const shiftPressedRef = useRef(false);
    const pointerShiftPressedRef = useRef(false);
    // Tracks the last commercial camera focus so we don't re-fly on unrelated model updates.
    const prevCommercialSegmentFocusRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Shift') {
                shiftPressedRef.current = true;
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'Shift') {
                shiftPressedRef.current = false;
            }
        };
        const resetShift = () => {
            shiftPressedRef.current = false;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', resetShift);
        document.addEventListener('visibilitychange', resetShift);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', resetShift);
            document.removeEventListener('visibilitychange', resetShift);
        };
    }, []);

    useEffect(() => {
        const canvas = viewerRef.current?.scene?.canvas;
        if (!canvas) return;

        const updatePointerShiftState = (event: MouseEvent | PointerEvent) => {
            pointerShiftPressedRef.current = !!event.shiftKey;
        };

        const resetPointerShiftState = () => {
            pointerShiftPressedRef.current = false;
        };

        canvas.addEventListener('pointerdown', updatePointerShiftState);
        canvas.addEventListener('mousedown', updatePointerShiftState);
        canvas.addEventListener('pointerup', resetPointerShiftState);
        canvas.addEventListener('mouseup', resetPointerShiftState);
        canvas.addEventListener('mouseleave', resetPointerShiftState);

        return () => {
            canvas.removeEventListener('pointerdown', updatePointerShiftState);
            canvas.removeEventListener('mousedown', updatePointerShiftState);
            canvas.removeEventListener('pointerup', resetPointerShiftState);
            canvas.removeEventListener('mouseup', resetPointerShiftState);
            canvas.removeEventListener('mouseleave', resetPointerShiftState);
        };
    }, [viewerReady]);
    const initialSceneReadyRef = useRef(false);
    const { getSatellitePositionCallback } = usePositionCallbacks(satellites, aircraft, interpolatedAircraftMapRef);
    const basemapApplyTokenRef = useRef(0);
    const basemapOptions = useMemo(() => {
        const byName = new Map<string, ProviderViewModel>();
        for (const viewModel of createDefaultImageryProviderViewModels()) {
            byName.set(normalizeBasemapName(viewModel.name), viewModel);
        }

        return DESIRED_BASEMAPS
            .map((entry) => {
                const viewModel = byName.get(entry.name);
                if (!viewModel) return null;
                return {
                    id: entry.id,
                    label: entry.label,
                    viewModel,
                };
            })
            .filter((entry): entry is BasemapOption => entry !== null);
    }, []);
    const [selectedBasemapId, setSelectedBasemapId] = useState<string>(() => {
        try {
            return localStorage.getItem(BASEMAP_STORAGE_KEY) ?? DESIRED_BASEMAPS[0].id;
        } catch {
            return DESIRED_BASEMAPS[0].id;
        }
    });

    // Apply theme to Cesium viewer
    useCesiumTheme(viewerRef, imageryThemeRevision);

    useEffect(() => {
        onGlobeBootPhaseChange?.('mounting');
    }, [onGlobeBootPhaseChange]);

    useEffect(() => {
        if (basemapOptions.length === 0) return;
        if (basemapOptions.some((option) => option.id === selectedBasemapId)) return;
        setSelectedBasemapId(basemapOptions[0].id);
    }, [basemapOptions, selectedBasemapId]);

    useEffect(() => {
        try {
            localStorage.setItem(BASEMAP_STORAGE_KEY, selectedBasemapId);
        } catch {
            // no-op
        }
    }, [selectedBasemapId]);

    // Handle scene mode changes
    useEffect(() => {
        if (viewerRef.current && onSceneModeChange) {
            const targetMode = sceneMode === '2D' ? SceneMode.SCENE2D : SceneMode.SCENE3D;
            if (viewerRef.current.scene.mode !== targetMode) {
                viewerRef.current.scene.mode = targetMode;
            }
        }
    }, [sceneMode, onSceneModeChange]);

    // Handle viewer initialization via callback ref
    const handleViewerRef = useCallback((e: any) => {
        if (e?.cesiumElement) {
            const viewer = e.cesiumElement;
            viewerRef.current = viewer;

            // Match canvas resolution to the physical pixel ratio so the globe renders
            // sharply on Retina / HiDPI displays.  Billboard and point scales are
            // expressed in physical pixels when resolutionScale > 1, which is why
            // DPR_FACTOR (= window.devicePixelRatio) is already baked into every
            // calculateDynamicScale() call — the two cancel out and icons end up
            // the same physical size on every device.
            viewer.resolutionScale = window.devicePixelRatio ?? 1;

            // Cap the render loop instead of redrawing at the display's native
            // refresh rate (60-120Hz) on every frame, even when nothing changes.
            // Satellite positions only update every 1-2s from the propagation
            // worker, so 30fps is visually indistinguishable while roughly
            // halving sustained CPU/GPU load and battery drain.
            viewer.targetFrameRate = 30;

            setViewerReady(true);
            onGlobeBootPhaseChange?.('viewer-ready');
        }
    }, [onGlobeBootPhaseChange]);

    // Notify parent when viewer is ready
    useEffect(() => {
        if (viewerReady && viewerRef.current && onCameraReady) {
            onCameraReady(viewerRef.current);
        }
    }, [viewerReady, onCameraReady]);

    // Notify parent when container is ready
    useEffect(() => {
        if (globeContainerRef.current && onGlobeContainerReady) {
            onGlobeContainerReady(globeContainerRef);
        }
    }, [onGlobeContainerReady]);

    // Configure scene settings
    useEffect(() => {
        if (!viewerRef.current) return;

        const viewer = viewerRef.current;

        // Set scene mode
        const targetMode = sceneMode === '2D' ? SceneMode.SCENE2D : SceneMode.SCENE3D;
        if (viewer.scene.mode !== targetMode) {
            viewer.scene.mode = targetMode;
        }
        // Apply lighting settings
        viewer.scene.globe.enableLighting = enableLighting;
        // Keep false: terrain depth testing causes polygon entities (coverage,
        // regulatory overlay) to fail the depth test at globe-view scale where
        // depth buffer precision cannot distinguish ground-level polygons from the
        // terrain surface. Entities on the far side of the Earth are still hidden
        // by the globe sphere via the regular depth buffer.
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.shadows = enableLighting;
    }, [sceneMode, enableLighting, viewerReady]);

    useEffect(() => {
        if (!viewerReady || !viewerRef.current) return;
        if (basemapOptions.length === 0) return;

        const selectedBasemap = basemapOptions.find((option) => option.id === selectedBasemapId) ?? basemapOptions[0];
        if (!selectedBasemap) return;

        const applyToken = ++basemapApplyTokenRef.current;
        let cancelled = false;
        const removeBasemapErrorListeners: Array<() => void> = [];

        const addBasemapErrorListener = (
            target: unknown,
            basemap: BasemapOption,
            source: string,
            onError: (error: unknown) => void,
        ) => {
            const errorEvent = (target as { errorEvent?: unknown } | null)?.errorEvent;
            if (!errorEvent || typeof errorEvent !== 'object') return;

            const addEventListener = (errorEvent as { addEventListener?: unknown }).addEventListener;
            const removeEventListener = (errorEvent as { removeEventListener?: unknown }).removeEventListener;
            if (typeof addEventListener !== 'function' || typeof removeEventListener !== 'function') return;

            const listener = (error: unknown) => {
                console.warn(`[Basemap] "${basemap.label}" ${source} error:`, error);
                onError(error);
            };

            addEventListener.call(errorEvent, listener);
            removeBasemapErrorListeners.push(() => {
                removeEventListener.call(errorEvent, listener);
            });
        };

        const cleanupBasemapErrorListeners = () => {
            while (removeBasemapErrorListeners.length > 0) {
                const removeListener = removeBasemapErrorListeners.pop();
                try {
                    removeListener?.();
                } catch {
                    // no-op
                }
            }
        };

        const addImageryForBasemap = async (
            basemap: BasemapOption,
            onTileError?: (error: unknown) => void,
        ) => {
            const created = basemap.viewModel.creationCommand();
            const resolved = await Promise.resolve(created) as unknown;
            const providers = Array.isArray(resolved) ? resolved : [resolved];

            if (cancelled || applyToken !== basemapApplyTokenRef.current || !viewerRef.current) return false;

            const layers = viewerRef.current.imageryLayers;
            cleanupBasemapErrorListeners();
            layers.removeAll();

            for (const provider of providers) {
                if (!provider) continue;
                const layer = layers.add(new ImageryLayer(provider as ConstructorParameters<typeof ImageryLayer>[0]));

                if (onTileError) {
                    addBasemapErrorListener(provider, basemap, 'provider', onTileError);
                    addBasemapErrorListener(layer, basemap, 'layer', onTileError);
                }
            }

            console.info(`[Basemap] Applied "${basemap.label}".`);
            return true;
        };

        const markImageryReady = () => {
            onGlobeBootPhaseChange?.('imagery-ready');
            setImageryThemeRevision((value) => value + 1);

            const viewer = viewerRef.current;
            if (!viewer) return;
            viewer.scene.requestRender();

            if (!initialSceneReadyRef.current) {
                const markSceneReady = () => {
                    viewer.scene.postRender.removeEventListener(markSceneReady);
                    if (initialSceneReadyRef.current) return;
                    initialSceneReadyRef.current = true;
                    onInitialGlobeReady?.();
                };

                viewer.scene.postRender.addEventListener(markSceneReady);
            }
        };

        const markInitialSceneReadyAfterFailure = () => {
            if (!initialSceneReadyRef.current) {
                initialSceneReadyRef.current = true;
                onInitialGlobeReady?.();
            }
        };

        const applyBasemap = async () => {
            let tileFallbackInProgress = false;
            const fallbackOnTileError = async (error: unknown) => {
                if (tileFallbackInProgress) return;
                if (selectedBasemap.id === FALLBACK_BASEMAP_ID) return;
                if (cancelled || applyToken !== basemapApplyTokenRef.current) return;

                const fallbackBasemap = basemapOptions.find((option) => option.id === FALLBACK_BASEMAP_ID);
                if (!fallbackBasemap) return;

                tileFallbackInProgress = true;
                try {
                    console.warn(`[Basemap] Falling back to "${fallbackBasemap.label}" after tile error.`, error);
                    const applied = await addImageryForBasemap(fallbackBasemap);
                    if (applied) {
                        setSelectedBasemapId(fallbackBasemap.id);
                        markImageryReady();
                    }
                } catch (fallbackError) {
                    console.error(`[Basemap] Failed to apply fallback "${fallbackBasemap.label}":`, fallbackError);
                    markInitialSceneReadyAfterFailure();
                }
            };

            try {
                const applied = await addImageryForBasemap(selectedBasemap, fallbackOnTileError);
                if (applied) markImageryReady();
            } catch (error) {
                console.error(`[Basemap] Failed to apply "${selectedBasemap.label}":`, error);

                const fallbackBasemap = basemapOptions.find((option) => option.id === FALLBACK_BASEMAP_ID);
                if (fallbackBasemap && fallbackBasemap.id !== selectedBasemap.id) {
                    try {
                        const applied = await addImageryForBasemap(fallbackBasemap);
                        if (applied) {
                            console.warn(`[Basemap] Falling back to "${fallbackBasemap.label}".`);
                            setSelectedBasemapId(fallbackBasemap.id);
                            markImageryReady();
                            return;
                        }
                    } catch (fallbackError) {
                        console.error(`[Basemap] Failed to apply fallback "${fallbackBasemap.label}":`, fallbackError);
                    }
                }

                markInitialSceneReadyAfterFailure();
            }
        };

        applyBasemap();

        return () => {
            cancelled = true;
            cleanupBasemapErrorListeners();
        };
    }, [basemapOptions, onGlobeBootPhaseChange, onInitialGlobeReady, selectedBasemapId, viewerReady]);

    // Keep Cesium clock aligned with real UTC time to avoid drift/lag
    useEffect(() => {
        if (!viewerReady || !viewerRef.current) return;

        const viewer = viewerRef.current;

        viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;
        viewer.clock.currentTime = JulianDate.now();
    }, [viewerReady]);

    useEffect(() => {
        if (!viewerReady || !viewerRef.current) return;

        const viewer = viewerRef.current;
        const updateCameraMetrics = () => {
            Cartesian3.clone(viewer.camera.position, cameraMetricsRef.current.position);
            cameraMetricsRef.current.height = viewer.camera.positionCartographic.height;
        };

        updateCameraMetrics();
        viewer.scene.preRender.addEventListener(updateCameraMetrics);
        return () => viewer.scene.preRender.removeEventListener(updateCameraMetrics);
    }, [viewerReady]);

    // Report viewport bounds to App after the camera settles (debounced 400 ms).
    // Used to feed air/maritime traffic fetching with the visible area.
    useEffect(() => {
        if (!viewerReady || !viewerRef.current || !onCameraViewChange) return;
        const viewer = viewerRef.current;
        const scratch = new Rectangle();
        let timer: ReturnType<typeof setTimeout> | null = null;

        const handleMoveEnd = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid, scratch);
                if (!rect) return;
                // Convert from radians to degrees; clamp to valid range.
                const toDeg = CesiumMath.toDegrees;
                const north = Math.min(toDeg(rect.north),  90);
                const south = Math.max(toDeg(rect.south), -90);
                let east   = toDeg(rect.east);
                let west   = toDeg(rect.west);
                // Normalise to –180…180
                if (east  >  180) east  -= 360;
                if (east  < -180) east  += 360;
                if (west  >  180) west  -= 360;
                if (west  < -180) west  += 360;
                const centerLat = (north + south) / 2;
                const centerLng = west <= east
                    ? (west + east) / 2
                    : (west + east + 360) / 2;     // antimeridian-safe midpoint
                onCameraViewChange({ north, south, east, west, centerLat, centerLng });
            }, 400);
        };

        viewer.camera.moveEnd.addEventListener(handleMoveEnd);
        // Fire immediately on mount so the first air-traffic fetch uses the correct area
        handleMoveEnd();
        return () => {
            if (timer) clearTimeout(timer);
            viewer.camera.moveEnd.removeEventListener(handleMoveEnd);
        };
    }, [viewerReady, onCameraViewChange]);

    // Handle camera target flyTo
    useEffect(() => {
        if (cameraTarget && viewerRef.current) {
            viewerRef.current.camera.flyTo({
                destination: getPosition(cameraTarget.lat, cameraTarget.lng, cameraTarget.alt),
                duration: 2
            });
        }
    }, [cameraTarget]);

    const commercialGeoCoverageFocusFrame = useMemo(() => (
        buildCommercialGeoCoverageFocusFrame(
            satellites,
            selectedPosition,
            [selectedDownlinkCoverage, selectedUplinkCoverage, selectedCoverage],
        )
    ), [satellites, selectedPosition, selectedCoverage, selectedUplinkCoverage, selectedDownlinkCoverage]);

    const commercialGeoCoverageFocusSignature = commercialGeoCoverageFocusFrame
        ? [
            commercialGeoCoverageFocusFrame.sphere.center.x.toFixed(0),
            commercialGeoCoverageFocusFrame.sphere.center.y.toFixed(0),
            commercialGeoCoverageFocusFrame.sphere.center.z.toFixed(0),
            commercialGeoCoverageFocusFrame.sphere.radius.toFixed(0),
        ].join(':')
        : 'no-coverage-frame';

    // Commercial route segment focus — fly camera to match the active focus target.
    // GEO satellite focus also re-frames when the selected coverage footprint changes.
    useEffect(() => {
        if (!commercialMode || !commercialRouteModel || !viewerRef.current) {
            if (!suppressCommercialCameraFocus) {
                prevCommercialSegmentFocusRef.current = undefined;
            }
            return;
        }
        const segmentId = commercialRouteModel.focusedSegmentId ?? 'summary';
        const routeGeometrySignature = commercialCameraFocusGeometrySignature(commercialRouteModel, segmentId);
        const useMobileHeroFocus = isPhone || isMobileViewport;
        const focusKey = useMobileHeroFocus
            ? `mobile-hero:${commercialRouteModel.technology}:${routeGeometrySignature}:${commercialGeoCoverageFocusSignature}`
            : commercialRouteModel.technology === 'GEO' && segmentId === 'satellite'
                ? `${segmentId}:${routeGeometrySignature}:${commercialGeoCoverageFocusSignature}`
                : `${segmentId}:${routeGeometrySignature}`;
        if (suppressCommercialCameraFocus) return;
        if (focusKey === prevCommercialSegmentFocusRef.current) return;
        prevCommercialSegmentFocusRef.current = focusKey;

        if (useMobileHeroFocus) {
            executeCommercialMobileHeroCamera(
                viewerRef.current,
                commercialRouteModel,
                commercialGeoCoverageFocusFrame,
            );
            return;
        }

        const focusTarget = commercialRouteModel.focusTargets.find(t => t.segmentId === segmentId);
        if (!focusTarget) return;

        executeCommercialFocusCamera(
            viewerRef.current,
            focusTarget,
            commercialRouteModel,
            commercialGeoCoverageFocusFrame,
        );
    }, [commercialMode, commercialGeoCoverageFocusFrame, commercialGeoCoverageFocusSignature, commercialRouteModel?.focusedSegmentId, commercialRouteModel, isMobileViewport, isPhone, suppressCommercialCameraFocus]);

    useEffect(() => {
        if (commercialMode || !viewerRef.current) return;
        removeCommercialSymbolicConnectivityEntities(viewerRef.current);
    }, [commercialMode]);

    useEffect(() => {
        if (!selectedMoon || !viewerRef.current || sceneMode !== '3D') return;

        const viewer = viewerRef.current;
        const time = viewer.clock.currentTime;
        const moonPosition = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
            time,
            new Cartesian3(),
        );
        const moonDirection = Cartesian3.normalize(moonPosition, new Cartesian3());
        const cameraDistanceFromEarthCenter = 70000000; // 70,000 km
        const destination = Cartesian3.multiplyByScalar(
            moonDirection,
            cameraDistanceFromEarthCenter,
            new Cartesian3(),
        );
        const direction = Cartesian3.normalize(
            Cartesian3.subtract(moonPosition, destination, new Cartesian3()),
            new Cartesian3(),
        );

        let upReference = Cartesian3.UNIT_Z;
        const alignmentWithNorth = Math.abs(Cartesian3.dot(direction, upReference));
        if (alignmentWithNorth > 0.98) {
            upReference = Cartesian3.UNIT_Y;
        }

        const right = Cartesian3.normalize(
            Cartesian3.cross(direction, upReference, new Cartesian3()),
            new Cartesian3(),
        );
        const up = Cartesian3.normalize(
            Cartesian3.cross(right, direction, new Cartesian3()),
            new Cartesian3(),
        );

        viewer.camera.flyTo({
            destination,
            orientation: {
                direction,
                up,
            },
            duration: 2.5,
        });
    }, [sceneMode, selectedMoon]);

    // Handle map click with proper entity detection.
    // aircraft/vessels/satellites are read from stable refs so this callback is
    // never recreated when those arrays change, preventing Cesium from
    // re-registering the ScreenSpaceEvent handler on every position update.
    const handleMapClick = useCallback((movement: { position: Cartesian2 } | { startPosition: Cartesian2, endPosition: Cartesian2 }) => {
        if (!viewerRef.current || !('position' in movement)) return;

        const pickedObject = viewerRef.current.scene.pick(movement.position);
        if (defined(pickedObject)) {
            const pickedId = typeof pickedObject.id === 'string'
                ? pickedObject.id
                : (pickedObject.id && typeof pickedObject.id.id === 'string' ? pickedObject.id.id : '');

            if (commercialMode && pickedId.startsWith('commercial-route-')) {
                const routeSegment = pickedId.slice('commercial-route-'.length).split('-')[0];
                const commercialSegmentId = routeSegment === 'backhaul'
                    ? 'summary'
                    : routeSegment === 'destination'
                        ? 'siteB'
                        : routeSegment;
                if (['access', 'satellite', 'siteB', 'summary'].includes(commercialSegmentId)) {
                    onCommercialSelectedSegmentChange?.(commercialSegmentId);
                    return;
                }
            }

            if (typeof pickedObject.id === 'string' && pickedObject.id.startsWith(GEO_COVERAGE_ENTITY_PREFIX)) {
                if (selection.type === 'satellite') {
                    onCoverageClick?.(pickedObject.id.slice(GEO_COVERAGE_ENTITY_PREFIX.length));
                    return;
                }
            }

            const pickedEntity = pickedObject.id;

            if (pickedEntity && typeof pickedEntity.id === 'string' && pickedEntity.id.startsWith(GEO_COVERAGE_ENTITY_PREFIX)) {
                if (selection.type === 'satellite') {
                    onCoverageClick?.(pickedEntity.id.slice(GEO_COVERAGE_ENTITY_PREFIX.length));
                    return;
                }
            }

            if (pickedId === 'moon-label' || pickedId === 'moon-body') {
                onMoonSelectionChange?.(true);
                return;
            }

            if (pickedEntity && (pickedEntity.billboard || pickedEntity.point)) {
                const entityId = typeof pickedEntity.id === 'string' ? pickedEntity.id : '';

                if (entityId.startsWith('aircraft-')) {
                    const aircraftId = entityId.slice('aircraft-'.length);
                    const selected = aircraftRef.current.find((ac) => ac.icao24 === aircraftId) ?? null;
                    onAircraftClick?.(selected);
                    return;
                }

                if (entityId.startsWith('vessel-')) {
                    const vesselId = entityId.slice('vessel-'.length);
                    const selected = vesselsRef.current.find((vessel) => vessel.mmsi === vesselId) ?? null;
                    onVesselClick?.(selected);
                    return;
                }

                if (entityId.startsWith('satellite-')) {
                    const satelliteId = entityId.slice('satellite-'.length);
                    const selected = satellitesRef.current.find((satellite) => satellite.id === satelliteId) ?? null;
                    onSatelliteClick(selected);
                    return;
                }

                if (entityId.startsWith('snp-')) {
                    onSnpClick(entityId.slice('snp-'.length));
                    return;
                }

                if (entityId === 'iss-entity') {
                    onIssClick?.();
                    return;
                }

                return;
            }
        }

        const viewer = viewerRef.current;
        const scene = viewer.scene;

        const ray = scene.camera.getPickRay(movement.position);
        let cartesian = undefined;
        if (ray) {
            cartesian = scene.globe.pick(ray, scene);
        }

        if (!cartesian) {
            cartesian = scene.camera.pickEllipsoid(movement.position, scene.globe.ellipsoid);
        }

        if (!cartesian) {
            onMoonSelectionChange?.(false);
            onSatelliteClick(null);
            onSnpClick(null);
            onAircraftClick?.(null);
            onVesselClick?.(null);
            onEmptyClick?.(pointerShiftPressedRef.current || shiftPressedRef.current);
            return;
        }

        const cartographic = Cartographic.fromCartesian(cartesian);
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        const lng = CesiumMath.toDegrees(cartographic.longitude);
        onPointClick(lat, lng, pointerShiftPressedRef.current || shiftPressedRef.current);
    }, [commercialMode, onAircraftClick, onCommercialSelectedSegmentChange, onCoverageClick, onEmptyClick, onIssClick, onMoonSelectionChange, onPointClick, onSatelliteClick, onSnpClick, onVesselClick, selection.type]);

    const leoS2SVisualResult = leoSiteToSiteFullResult ?? leoSiteToSiteResult;

    const oneWebVisualTargets = useMemo(() => {
        type ServingPoint = {
            id: string;
            position: { lat: number; lng: number };
            label: string;
        };
        type VisualTarget = {
            satellite: SatelliteData;
            servingPoints: ServingPoint[] | null;
            commercialProjectionOrigin: RouteCoordinate | null;
        };

        const targets: VisualTarget[] = [];
        const findLiveSatellite = (satellite: SatelliteData): SatelliteData => (
            satellites.find((item) => item.id === satellite.id) ?? satellite
        );
        const addTarget = (
            satellite: SatelliteData | null | undefined,
            servingPoint: ServingPoint | null = null,
        ) => {
            if (!satellite || satellite.type !== 'ONEWEB' || !isOperationalSatellite(satellite)) return;
            const liveSatellite = findLiveSatellite(satellite);
            const existing = targets.find((entry) => entry.satellite.id === liveSatellite.id);
            if (existing) {
                if (servingPoint && existing.servingPoints && !existing.servingPoints.some((point) => point.id === servingPoint.id)) {
                    existing.servingPoints.push(servingPoint);
                }
                return;
            }
            targets.push({
                satellite: liveSatellite,
                servingPoints: servingPoint ? [servingPoint] : null,
                commercialProjectionOrigin: commercialMode
                    ? getCommercialLeoProjectionOrigin(commercialRouteModel, liveSatellite)
                    : null,
            });
        };

        if (selectedSatellite && !commercialMode) {
            addTarget(selectedSatellite);
            return targets;
        }

        const commercialLeoRouteEvaluated = !commercialMode
            || commercialViewModel?.comparison.options.find((option) => option.technology === 'leo')?.status !== 'unknown';

        if (satelliteScope !== 'GEO' && leoS2SVisualResult && pointBLeo && commercialLeoRouteEvaluated) {
            addTarget(leoS2SVisualResult.servingSatelliteA, {
                id: 'site-a',
                position: leoS2SVisualResult.endpointA,
                label: 'Site A',
            });
            addTarget(leoS2SVisualResult.servingSatelliteB, {
                id: 'site-b',
                position: leoS2SVisualResult.endpointB,
                label: 'Site B',
            });
            return targets;
        }

        if (commercialLeoRouteEvaluated) {
            addTarget(autoSelectedLEOSatellite);
        }
        return targets;
    }, [
        autoSelectedLEOSatellite,
        commercialMode,
        commercialRouteModel,
        commercialViewModel,
        leoS2SVisualResult,
        pointBLeo,
        satelliteScope,
        satellites,
        selectedSatellite,
    ]);

    const geoBeamCone = useMemo(() => {
        // Only render the beam cone in auto-selection context (no manual satellite selected)
        if (selectedSatellite && !commercialMode) return { beamFeature: null, coverageFeatures: [], sat: null };
        if (!autoSelectedGEOSatellite) return { beamFeature: null, coverageFeatures: [], sat: null };
        const beamFeature = selectedGEOBeam?.feature ?? null;
        const coverageFeatures = selectedGEOBeam?.coverageFeatures ?? [];
        if (!beamFeature && coverageFeatures.length === 0) {
            return { beamFeature: null, coverageFeatures: [], sat: null };
        }
        return { beamFeature, coverageFeatures, sat: autoSelectedGEOSatellite };
    }, [commercialMode, selectedSatellite, autoSelectedGEOSatellite, selectedGEOBeam]);

    const projectionCoverageGroups = useMemo<ProjectionCoverageGroup[]>(() => {
        if (selectedSatellite) return [];
        if (!autoSelectedGEOSatellite) return [];
        if (linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT') return [];

        const satellite = satellites.find((item) => item.id === autoSelectedGEOSatellite.id) ?? autoSelectedGEOSatellite;
        const toGroup = (
            coverage: CandidateCoverage | null,
            direction: ProjectionCoverageGroup['direction'],
        ): ProjectionCoverageGroup | null => {
            if (!coverage || coverage.isSynthesized || coverage.satelliteId !== satellite.id) return null;
            const features = satellite.coverages
                .filter((item) => getCoverageGroupId(item) === coverage.coverageKey)
                .map((item) => item.feature)
                .filter((feature): feature is Feature<Geometry, GeoJsonProperties> => Boolean(feature));
            return features.length > 0 ? { direction, features } : null;
        };

        return [
            toGroup(selectedUplinkCoverage, 'uplink'),
            toGroup(selectedDownlinkCoverage, 'downlink'),
        ].filter((group): group is ProjectionCoverageGroup => group !== null);
    }, [
        autoSelectedGEOSatellite,
        linkMode,
        satellites,
        selectedDownlinkCoverage,
        selectedSatellite,
        selectedUplinkCoverage,
    ]);

    // Gateway resolution is owned by App.tsx (lifted in COMM-6C3A).
    // resolvedAutoGeoGateway and resolvedSelectedGeoGateway arrive as props.
    const activeResolvedGeoGateway = resolvedSelectedGeoGateway ?? resolvedAutoGeoGateway;
    const selectedGeoGatewayName = activeResolvedGeoGateway?.gatewayName ?? null;

    // satelliteById, aircraftById, vesselById are only consulted in hover/click
    // callbacks (user interaction). Storing them in refs means the callbacks can
    // always read the latest data without capturing the Map in their closure —
    // otherwise the callbacks would be recreated on every 2s satellite tick,
    // causing SatelliteLayer's 600-entity useMemo to rebuild unnecessarily.
    const satelliteByIdRef = useRef<Map<string, SatelliteData>>(new Map());
    satelliteByIdRef.current = useMemo(
        () => new Map(satellites.map((item) => [item.id, item])),
        [satellites]
    );

    const aircraftByIdRef = useRef<Map<string, Aircraft>>(new Map());
    aircraftByIdRef.current = useMemo(
        () => new Map(aircraft.map((item) => [item.icao24, item])),
        [aircraft]
    );

    const vesselByIdRef = useRef<Map<string, Vessel>>(new Map());
    vesselByIdRef.current = useMemo(
        () => new Map(vessels.map((item) => [item.mmsi, item])),
        [vessels]
    );

    const snpByName = useMemo(
        () => new Map(SNPS_DATA.map((item) => [item.name, item])),
        []
    );

    const gatewayByName = useMemo(
        () => new Map(GEO_GATEWAYS.map((item) => [item.name, item])),
        []
    );

    const pulsedSatellites = useMemo(() => {
        const targets: SatelliteData[] = [];
        const add = (satellite: SatelliteData | null | undefined) => {
            if (!satellite) return;
            if (!isOperationalSatellite(satellite)) return;
            const liveSatellite = satellites.find((item) => item.id === satellite.id) ?? satellite;
            if (targets.some((item) => item.id === liveSatellite.id)) return;
            targets.push(liveSatellite);
        };

        if (selectedSatellite && !commercialMode) {
            add(selectedSatellite);
            return targets;
        }

        add(autoSelectedLEOSatellite);
        if (satelliteScope !== 'GEO' && leoS2SVisualResult && pointBLeo) {
            add(leoS2SVisualResult.servingSatelliteA);
            add(leoS2SVisualResult.servingSatelliteB);
        }
        add(autoSelectedGEOSatellite);
        return targets;
    }, [
        selectedSatellite,
        autoSelectedLEOSatellite,
        autoSelectedGEOSatellite,
        leoS2SVisualResult,
        pointBLeo,
        satelliteScope,
        satellites,
        commercialMode,
    ]);

    // Engineering Mode owns real satellite inspection. Commercial Mode uses the
    // symbolic service layer and coverage footprints instead of satellite icons.
    // While the Engineering Analysis workspace is open, the globe is reduced to a
    // context strip — only the satellite(s) on the active route stay rendered
    // instead of the full visible constellation, falling back to the full list
    // if no route satellite has resolved yet so the globe isn't left empty.
    const satellitesForLayer = useMemo(() => {
        if (commercialMode) return [];
        if (displayPrefs.simplifySatellitesForEngineeringAnalysis && pulsedSatellites.length > 0) {
            return pulsedSatellites;
        }
        return satellites;
    }, [commercialMode, satellites, displayPrefs.simplifySatellitesForEngineeringAnalysis, pulsedSatellites]);

    // Per-technology route availability used both for satellite label role assignment and
    // for transmission link visibility. Computed here so both consumers share the same value.
    const commercialLeoOption = commercialViewModel?.comparison.options.find((option) => option.technology === 'leo');
    const commercialGeoOption = commercialViewModel?.comparison.options.find((option) => option.technology === 'geo');
    const commercialLeoOptionAvailable = !commercialMode || commercialLeoOption?.available === true;
    const commercialGeoOptionAvailable = !commercialMode || commercialGeoOption?.available === true;
    const commercialLeoOptionEvaluated = !commercialMode || Boolean(commercialLeoOption && commercialLeoOption.status !== 'unknown');
    const commercialGeoOptionEvaluated = !commercialMode || Boolean(commercialGeoOption && commercialGeoOption.status !== 'unknown');
    const commercialDominantTechnology: 'LEO' | 'GEO' | null =
        commercialMode
        && commercialViewModel
        && commercialViewModel.recommendation.technology !== 'not_available'
        && commercialViewModel.recommendation.technology !== 'insufficient_data'
            ? commercialViewModel.commercialDisplayTechnology
            : null;
    const commercialRouteTechnology: 'LEO' | 'GEO' | null = commercialRouteModel?.technology ?? commercialViewModel?.commercialDisplayTechnology ?? null;
    const commercialGeoCoverageIdentityForLabel = selectedDownlinkCoverage ?? selectedUplinkCoverage ?? selectedCoverage;
    const commercialGeoSatelliteLabelLines = useMemo(() => (
        [
            commercialGeoCoverageIdentityForLabel?.beamName,
            formatCommercialFrequencyBand(commercialGeoCoverageIdentityForLabel?.band),
        ].filter((line): line is string => !!line && line.trim().length > 0)
    ), [commercialGeoCoverageIdentityForLabel]);

    const highlightedSatelliteLabels = useMemo(() => {
        const labels: Array<{
            satellite: SatelliteData;
            isManuallySelected: boolean;
            isRouteParticipant?: boolean;
            serviceRoles?: Array<'A' | 'B'>;
            commercialRole?: 'serving' | 'alternative' | 'candidate';
            commercialLabelLines?: string[];
        }> = [];
        const commercialRoleForTechnology = (technology: 'LEO' | 'GEO', available: boolean): 'serving' | 'alternative' | 'candidate' => {
            if (!commercialMode) return available ? 'serving' : 'candidate';
            if (!commercialRouteTechnology) return 'candidate';
            if (technology === commercialRouteTechnology && available) return 'serving';
            if (available) return 'alternative';
            return 'candidate';
        };
        const add = (
            satellite: SatelliteData | null | undefined,
            isManuallySelected: boolean,
            serviceRole?: 'A' | 'B',
            isRouteParticipant = !isManuallySelected,
            commercialRole?: 'serving' | 'alternative' | 'candidate',
            commercialLabelLines?: string[],
        ) => {
            if (!satellite) return;
            if (!isOperationalSatellite(satellite)) return;
            const liveSatellite = satellites.find((item) => item.id === satellite.id) ?? satellite;
            const existing = labels.find((entry) => entry.satellite.id === liveSatellite.id);
            if (existing) {
                existing.isManuallySelected = existing.isManuallySelected || isManuallySelected;
                existing.isRouteParticipant = existing.isRouteParticipant || isRouteParticipant;
                if (commercialRole) {
                    existing.commercialRole = existing.commercialRole === 'serving' || commercialRole === 'serving'
                        ? 'serving'
                        : existing.commercialRole === 'alternative' || commercialRole === 'alternative'
                            ? 'alternative'
                            : 'candidate';
                }
                if (serviceRole && !existing.serviceRoles?.includes(serviceRole)) {
                    existing.serviceRoles = [...(existing.serviceRoles ?? []), serviceRole].sort();
                }
                if (commercialLabelLines && commercialLabelLines.length > 0) {
                    existing.commercialLabelLines = commercialLabelLines;
                }
                return;
            }
            labels.push({
                satellite: liveSatellite,
                isManuallySelected,
                isRouteParticipant,
                commercialRole,
                commercialLabelLines,
                serviceRoles: serviceRole ? [serviceRole] : undefined,
            });
        };

        if (selectedSatellite && !commercialMode) {
            add(selectedSatellite, true, undefined, false);
            return labels;
        }

        if (satelliteScope !== 'GEO' && leoS2SVisualResult && pointBLeo) {
            const leoIsServing = commercialRoleForTechnology('LEO', commercialLeoOptionAvailable) === 'serving';
            add(leoS2SVisualResult.servingSatelliteA, false, 'A', leoIsServing, commercialRoleForTechnology('LEO', commercialLeoOptionAvailable));
            add(leoS2SVisualResult.servingSatelliteB, false, 'B', leoIsServing, commercialRoleForTechnology('LEO', commercialLeoOptionAvailable));
        } else {
            const leoRole = commercialRoleForTechnology('LEO', commercialLeoOptionAvailable);
            add(autoSelectedLEOSatellite, false, undefined, leoRole === 'serving', leoRole);
        }
        const geoRole = commercialRoleForTechnology('GEO', commercialGeoOptionAvailable);
        add(autoSelectedGEOSatellite, false, undefined, geoRole === 'serving', geoRole, commercialGeoSatelliteLabelLines);
        return labels;
    }, [
        selectedSatellite,
        autoSelectedLEOSatellite,
        autoSelectedGEOSatellite,
        leoS2SVisualResult,
        pointBLeo,
        satelliteScope,
        satellites,
        commercialMode,
        commercialRouteTechnology,
        commercialLeoOptionAvailable,
        commercialGeoOptionAvailable,
        commercialGeoSatelliteLabelLines,
    ]);

    const pulsedSnp = useMemo(() => {
        if (inspectedSNP) return inspectedSNP;
        if (!selectedSNP) return null;
        if (typeof selectedSNP === 'string') {
            return snpByName.get(selectedSNP) ?? null;
        }
        return snpByName.get(selectedSNP.name) ?? selectedSNP;
    }, [inspectedSNP, selectedSNP, snpByName]);

    const pulsedGateway = useMemo(() => {
        return activeResolvedGeoGateway?.gateway ?? null;
    }, [activeResolvedGeoGateway]);

    // Commercial mode SNP allowlist.  null = no filtering (engineering mode).
    // In commercial mode only route-participant and selected/candidate SNPs are
    // visible; the full global SNPS_DATA list is hidden.
    const commercialSnpAllowlist = useMemo((): Set<string> | null => {
        if (!commercialMode) return null;
        const names = new Set<string>();
        // Site-to-site route SNPs
        if (leoS2SVisualResult?.selectedSnpA) names.add(leoS2SVisualResult.selectedSnpA.name);
        if (leoS2SVisualResult?.selectedSnpB) names.add(leoS2SVisualResult.selectedSnpB.name);
        // Single-site selected / candidate SNP
        const snpName = typeof selectedSNP === 'string' ? selectedSNP : (selectedSNP?.name ?? null);
        if (snpName) names.add(snpName);
        if (inspectedSNP?.name) names.add(inspectedSNP.name);
        return names;
    }, [commercialMode, leoS2SVisualResult, selectedSNP, inspectedSNP]);

    // Commercial mode gateway allowlist.  null = no filtering (engineering mode).
    // In commercial mode only the gateway that is active for the current GEO route
    // is visible; the full GEO_GATEWAYS list is hidden.
    //
    // trafficStatus gate: only CONFIRMED or PUBLICLY_LIKELY sites are shown in
    // commercial mode. UNVERIFIED sites are deliberately excluded — showing them
    // would present a site with no confirmed commercial traffic role to a
    // non-engineering stakeholder as if it were the active commercial teleport.
    // The empty Set (not null) is intentional: null = engineering mode (show all);
    // empty Set = commercial mode with no eligible gateway to display.
    const commercialGatewayAllowlist = useMemo((): Set<string> | null => {
        if (!commercialMode) return null;
        const names = new Set<string>();
        if (pulsedGateway) {
            const { trafficStatus } = pulsedGateway;
            if (trafficStatus === 'CONFIRMED' || trafficStatus === 'PUBLICLY_LIKELY') {
                names.add(pulsedGateway.name);
            }
        }
        return names;
    }, [commercialMode, pulsedGateway]);

    useEffect(() => {
        if (!import.meta.env.DEV || !activeResolvedGeoGateway || !pulsedGateway) return;
        if (activeResolvedGeoGateway.gatewayId === pulsedGateway.gateway_id) return;

        console.error('[GEO Gateway Desync]', {
            satelliteName: (resolvedSelectedGeoGateway ? selectedSatellite : autoSelectedGEOSatellite)?.name ?? 'Unknown GEO satellite',
            rfGatewayId: activeResolvedGeoGateway.gatewayId,
            renderedGatewayId: pulsedGateway.gateway_id,
            sourceComponent: 'CesiumGlobe:GeoGatewayLayer',
        });
    }, [
        activeResolvedGeoGateway,
        autoSelectedGEOSatellite,
        pulsedGateway,
        resolvedSelectedGeoGateway,
        selectedSatellite,
    ]);

    const setHoveredEntityIfChanged = useCallback((key: string | null, nextEntity: HoveredEntity) => {
        if (hoveredEntityKeyRef.current === key) return;
        hoveredEntityKeyRef.current = key;
        setHoveredEntity(nextEntity);
    }, []);

    const clearInspectionHover = useCallback(() => {
        onSatelliteHover(null);
        onAircraftHover?.(null);
        onVesselHover?.(null);
        onSnpHover(null);
        setHoveredEntityIfChanged(null, null);
    }, [onAircraftHover, onSatelliteHover, onSnpHover, onVesselHover, setHoveredEntityIfChanged]);

    const handleSatelliteHover = useCallback((satelliteId: string | null) => {
        onSatelliteHover(satelliteId);
        if (!satelliteId) {
            setHoveredEntityIfChanged(null, null);
            return;
        }

        // Read from ref — always current, no dep needed, callback stays stable.
        const satellite = satelliteByIdRef.current.get(satelliteId) ?? null;
        setHoveredEntityIfChanged(
            satellite ? `satellite:${satelliteId}` : null,
            satellite ? { type: 'satellite', data: satellite } : null
        );
    }, [onSatelliteHover, setHoveredEntityIfChanged]);

    const handleAircraftHover = useCallback((aircraftItem: Aircraft | null) => {
        onAircraftHover?.(aircraftItem);
        setHoveredEntityIfChanged(
            aircraftItem ? `aircraft:${aircraftItem.icao24}` : null,
            aircraftItem ? { type: 'aircraft', data: aircraftItem } : null
        );
    }, [onAircraftHover, setHoveredEntityIfChanged]);

    const handleVesselHover = useCallback((vesselItem: Vessel | null) => {
        onVesselHover?.(vesselItem);
        setHoveredEntityIfChanged(
            vesselItem ? `vessel:${vesselItem.mmsi}` : null,
            vesselItem ? { type: 'vessel', data: vesselItem } : null
        );
    }, [onVesselHover, setHoveredEntityIfChanged]);


    const handleSnpHover = useCallback((snpName: string | null) => {
        onSnpHover(snpName);
        if (!snpName) {
            setHoveredEntityIfChanged(null, null);
            return;
        }

        const snp = snpByName.get(snpName) ?? null;
        setHoveredEntityIfChanged(
            snp ? `snp:${snpName}` : null,
            snp ? { type: 'snp', data: snp } : null
        );
    }, [onSnpHover, setHoveredEntityIfChanged, snpByName]);

    const handleGatewayHover = useCallback((gatewayName: string | null) => {
        onSnpHover(gatewayName);
        if (!gatewayName) {
            setHoveredEntityIfChanged(null, null);
            return;
        }

        const gateway = gatewayByName.get(gatewayName) ?? null;
        setHoveredEntityIfChanged(
            gateway ? `gateway:${gatewayName}` : null,
            gateway ? { type: 'gateway', data: gateway } : null
        );
    }, [gatewayByName, onSnpHover, setHoveredEntityIfChanged]);

    const handleGeoCoverageLegendItemsChange = useCallback((items: GeoCoverageLegendItem[]) => {
        setGeoCoverageLegendItems(items);
    }, []);

    const handleGeoCoverageLegendHoverChange = useCallback((itemKey: string | null) => {
        setFocusedGeoCoverageLegendKey(itemKey);
    }, []);

    const handleMapHover = useCallback((movement: { position: Cartesian2 } | { startPosition: Cartesian2; endPosition: Cartesian2 }) => {
        const screenPosition = 'endPosition' in movement ? movement.endPosition : movement.position;
        inspectionCursorPositionRef.current = { x: screenPosition.x, y: screenPosition.y };
        const currentHoveredKey = hoveredEntityKeyRef.current;

        const viewer = viewerRef.current;
        if (!viewer) {
            if (currentHoveredKey?.startsWith('country5g:')) {
                setHoveredEntityIfChanged(null, null);
            }
            return;
        }

        if (countryOverlayMode !== '5g-spectrum') {
            if (currentHoveredKey?.startsWith('country5g:')) {
                setHoveredEntityIfChanged(null, null);
            }
        } else if (currentHoveredKey?.startsWith('country5g:')) {
            // Keep the 5G overlay interactive for clicks/selection, but suppress the
            // hover inspection tooltip over countries in this mode.
            setHoveredEntityIfChanged(null, null);
        }

        if (!currentHoveredKey || currentHoveredKey.startsWith('country5g:')) {
            return;
        }

        const pickedObject = viewer.scene.pick(screenPosition);
        const pickedHoverKey = getHoverKeyFromPickedObject(pickedObject);
        if (pickedHoverKey !== currentHoveredKey) {
            clearInspectionHover();
        }
    }, [clearInspectionHover, countryOverlayMode, setHoveredEntityIfChanged]);

    useEffect(() => {
        const container = globeContainerRef.current;
        if (!container) return;

        const handleMouseLeave = () => {
            inspectionCursorPositionRef.current = null;
            clearInspectionHover();
        };

        container.addEventListener('mouseleave', handleMouseLeave);
        return () => {
            container.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [clearInspectionHover]);

    useEffect(() => {
        if (countryOverlayMode !== '5g-spectrum' && hoveredEntityKeyRef.current?.startsWith('country5g:')) {
            setHoveredEntityIfChanged(null, null);
        }
    }, [countryOverlayMode, setHoveredEntityIfChanged]);

    useEffect(() => {
        if (geoCoverageLegendItems.length > 0) return;
        setFocusedGeoCoverageLegendKey(null);
    }, [geoCoverageLegendItems.length]);

    // This effect keeps the hoveredEntity card in sync when the underlying data
    // objects change (e.g. satellite position update, aircraft data refresh).
    // aircraftById and vesselById are now read from stable refs so this effect
    // no longer runs at 60fps when air-traffic interpolation is active.
    useEffect(() => {
        const key = hoveredEntityKeyRef.current;
        if (!key) return;

        const [type, id] = key.split(':');

        if (type === 'satellite') {
            const satellite = satelliteByIdRef.current.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!satellite) return null;
                if (current?.type === 'satellite' && current.data === satellite) return current;
                return { type: 'satellite', data: satellite };
            });
            return;
        }

        if (type === 'aircraft') {
            const aircraftItem = aircraftByIdRef.current.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!aircraftItem) return null;
                if (current?.type === 'aircraft' && current.data === aircraftItem) return current;
                return { type: 'aircraft', data: aircraftItem };
            });
            return;
        }

        if (type === 'vessel') {
            const vesselItem = vesselByIdRef.current.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!vesselItem) return null;
                if (current?.type === 'vessel' && current.data === vesselItem) return current;
                return { type: 'vessel', data: vesselItem };
            });
            return;
        }

        if (type === 'snp') {
            const snp = snpByName.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!snp) return null;
                if (current?.type === 'snp' && current.data === snp) return current;
                return { type: 'snp', data: snp };
            });
            return;
        }

        if (type === 'gateway') {
            const gateway = gatewayByName.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!gateway) return null;
                if (current?.type === 'gateway' && current.data === gateway) return current;
                return { type: 'gateway', data: gateway };
            });
        }
    // All three entity maps are refs — reading them doesn't add deps here.
    // The effect re-runs when satellites change (2s) to keep the hover card current,
    // and when the static gateway/snp maps are first created (once, on mount).
    }, [gatewayByName, satellites, snpByName]);

    // Create stable pixel size callback for selected position marker
    const positionMarkerPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!selectedPosition) return 4;

            const position = getPosition(selectedPosition.lat, selectedPosition.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);

            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 16 * (sizeScale || 1);
        }, false);
    }, [selectedPosition, sizeScale]);

    const siteBMarkerPosition = pointB ?? pointBLeo;
    const [activeEndpointPulse, setActiveEndpointPulse] = useState<SelectionAnalysisProps['endpointSelectionMotion']>(null);

    useEffect(() => {
        if (!endpointSelectionMotion) return;
        setActiveEndpointPulse(endpointSelectionMotion);
        const timeout = window.setTimeout(() => setActiveEndpointPulse(null), 560);
        return () => window.clearTimeout(timeout);
    }, [endpointSelectionMotion]);

    const siteLabelsAreClose = useMemo(() => {
        if (!selectedPosition || !siteBMarkerPosition) return false;
        return commercialApproxDistanceKm(selectedPosition, siteBMarkerPosition) < 700;
    }, [selectedPosition, siteBMarkerPosition]);

    const pointBMarkerPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!siteBMarkerPosition) return 4;
            const position = getPosition(siteBMarkerPosition.lat, siteBMarkerPosition.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 16 * (sizeScale || 1);
        }, false);
    }, [siteBMarkerPosition, sizeScale]);

    const commercialFocusPointPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!selectedPosition) return 4;
            const position = getPosition(selectedPosition.lat, selectedPosition.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 22 * (sizeScale || 1);
        }, false);
    }, [selectedPosition, sizeScale]);

    const commercialFocusPointBPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!siteBMarkerPosition) return 4;
            const position = getPosition(siteBMarkerPosition.lat, siteBMarkerPosition.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 22 * (sizeScale || 1);
        }, false);
    }, [siteBMarkerPosition, sizeScale]);

    const leoDisplayOptionsAvailable = satelliteScope !== 'GEO';
    const showGroundSelectedPoint = !!selectedPosition && !selectedAircraft && !selectedVessel;
    const effectiveCountryOverlayMode: CountryOverlayMode =
        commercialMode
            ? 'none'
            : countryOverlayMode === 'regulatory'
            ? (leoDisplayOptionsAvailable ? 'regulatory' : 'none')
            : countryOverlayMode;
    // Prefer the route model's focusedSegmentId (already canonical, 'siteB'→'destination'
    // translated). Fall back to the legacy derivation from the viewModel segment type.
    const commercialFocusedSegment: CommercialRouteSegmentId = (
        commercialRouteModel?.focusedSegmentId
        ?? (commercialViewModel?.routeSegments.find(s => s.id === commercialViewModel.selectedSegmentId)?.type as CommercialRouteSegmentId | undefined)
        ?? 'summary'
    );
    const commercialActiveRouteAvailable = !commercialMode || commercialViewModel?.activeRouteAvailable === true;
    const commercialAccessFocused = commercialMode && commercialFocusedSegment === 'access';
    const commercialDestinationFocused = commercialMode && commercialFocusedSegment === 'destination';
    const commercialSummaryFocused = commercialMode && commercialFocusedSegment === 'summary';
    const commercialSatelliteFocused = commercialMode && commercialFocusedSegment === 'satellite';
    const commercialBackhaulFocused = commercialMode && commercialFocusedSegment === 'backhaul';
    const commercialGeoSatelliteFocused = commercialMode && commercialFocusedSegment === 'satellite' && commercialRouteTechnology === 'GEO';
    const showCommercialSiteALabel = !commercialMode || !!commercialRouteModel;
    const showCommercialSiteBLabel = !commercialMode || !!commercialRouteModel;

    const selectedRegulatoryCountryOutlineVisible =
        effectiveCountryOverlayMode === 'regulatory'
        && !!selectedPosition
        && !!selectedRegulatoryResult
        && !selectedRegulatoryResult.isOcean
        && !!selectedRegulatoryResult.countryName;
    const hasSatelliteIndicator =
        !!(selectedSatellite || autoSelectedLEOSatellite || autoSelectedGEOSatellite);
    const hasCoverageSwitcher =
        selection.type === 'target'
        && selection.targetType === 'point'
        && coverageSwitcherCoverages.length >= 2
        && !!onCoverageSwitcherSelect;
    const commercialGeoCoverageVisible =
        commercialMode
        && satelliteScope !== 'LEO'
        && commercialGeoOptionEvaluated
        && (
            (
                selection.type === 'target'
                && !!(selectedCoverage || selectedUplinkCoverage || selectedDownlinkCoverage)
            )
            || selection.type === 'coverage'
            || selection.type === 'contour'
        );
    const commercialGeoCoverageIdentity = selectedDownlinkCoverage ?? selectedUplinkCoverage ?? selectedCoverage;
    const commercialGeoCoverageLabel = commercialGeoCoverageIdentity
        ? [
            commercialGeoCoverageIdentity.satelliteName,
            commercialGeoCoverageIdentity.beamName,
        ].filter(Boolean).join(' · ')
        : satelliteScope === 'ALL'
            ? (commercialViewModel?.commercialDisplayTechnology === 'LEO' ? 'GEO backup coverage' : 'GEO service area')
            : 'GEO service area';
    const selectedCountryOutlineStatus =
        satelliteScope === 'GEO'
            ? 'UNKNOWN'
            : (selectedRegulatoryResult?.status ?? 'UNKNOWN');
    const fillRateLayerAvailable = isFillRateLayerAvailableForScope(satelliteScope);
    const effectiveShowFillRateLayer = getEffectiveFillRateLayerVisible({
        requested: showFillRateLayer,
        satelliteScope,
        countryOverlayMode: effectiveCountryOverlayMode,
        commercialMode,
    });

    return (
        <div className="relative w-full h-full">
            {/* UI Overlays */}
            {!commercialMode && (
                <PositionDisplay
                    selectedPosition={selectedPosition}
                    selectedAircraft={selectedAircraft}
                    isPhone={isPhone}
                />
            )}

            {!commercialMode && (!isMobileViewport || !!selectedSatellite) && (
                <SatelliteIndicator
                    selectedSatellite={selectedSatellite}
                    autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                    autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                    onSatelliteClick={onSatelliteClick}
                    viewerRef={viewerRef}
                    isPhone={isPhone}
                    isFullscreen={isFullscreen}
                />
            )}

            {!commercialMode && (
                <CountryOverlayLegend
                    mode={effectiveCountryOverlayMode}
                    isPhone={isPhone}
                />
            )}

            {!commercialMode && (
                <FillRateLegend
                    show={effectiveShowFillRateLayer}
                    isPhone={isPhone}
                />
            )}

            <GlobeIntelligenceRail
                viewerRef={viewerRef}
                isFullscreen={isFullscreen}
                onToggleFullscreen={onToggleFullscreen}
                variant={commercialMode || displayPrefs.isCompactMap ? 'camera-only' : 'full'}
                placement="right"
                rightOffset={commercialMode && !isFullscreen && !isPhone && !isMobileViewport ? 'calc(380px + 1rem)' : undefined}
                countryOverlayMode={effectiveCountryOverlayMode}
                onCountryOverlayModeChange={onCountryOverlayModeChange ?? (() => {})}
                showAggregatedConnectivity={showAggregatedConnectivity}
                onToggleAggregatedConnectivity={onToggleAggregatedConnectivity ?? (() => {})}
                showFillRateLayer={showFillRateLayer}
                onToggleFillRateLayer={onToggleFillRateLayer ?? (() => {})}
                fillRateLayerAvailable={fillRateLayerAvailable}
                airTrafficEnabled={airTrafficEnabled}
                onToggleAirTraffic={onToggleAirTraffic ?? (() => {})}
                maritimeTrafficEnabled={maritimeTrafficEnabled}
                onToggleMaritimeTraffic={onToggleMaritimeTraffic ?? (() => {})}
                issLiveEnabled={issLiveEnabled}
                onToggleIssLive={onToggleIssLive ?? (() => {})}
                enableLighting={enableLighting}
                onToggleLighting={onToggleLighting}
                showSatelliteTrajectory={showSatelliteTrajectory}
                onToggleSatelliteTrajectory={onToggleSatelliteTrajectory}
                showFootprintProjection={showFootprintProjection}
                onToggleFootprintProjection={onToggleFootprintProjection}
                showFlowAnimation={showFlowAnimation}
                onToggleFlowAnimation={onToggleFlowAnimation}
                sizeScale={sizeScale}
                onSizeScaleChange={onSizeScaleChange}
                onSizeScaleReset={onSizeScaleReset}
                sceneMode={sceneMode}
                onSceneModeChange={onSceneModeChange}
                basemapOptions={basemapOptions.map(({ id, label }) => ({ id, label }))}
                selectedBasemapId={selectedBasemapId}
                onBasemapChange={setSelectedBasemapId}
                isPhone={isPhone}
                isMobileViewport={isMobileViewport}
            />

            {!commercialMode && !displayPrefs.isCompactMap && selection.type === 'target' && selection.targetType === 'point' && coverageSwitcherCoverages.length >= 2 && onCoverageSwitcherSelect && (
                <CoverageSwitcherVertical
                    coverages={coverageSwitcherCoverages}
                    selectedId={selectedCoverageId}
                    onSelect={onCoverageSwitcherSelect}
                    isPhone={!!isPhone}
                    isFullscreen={isFullscreen}
                    hasSatelliteIndicator={hasSatelliteIndicator}
                />
            )}

            {!commercialMode && !displayPrefs.isCompactMap && !isPhone && !isMobileViewport && (
                <GeoCoverageLegendPanel
                    items={geoCoverageLegendItems}
                    hoveredItemKey={focusedGeoCoverageLegendKey}
                    onHoverItemChange={handleGeoCoverageLegendHoverChange}
                    isPhone={false}
                    isFullscreen={isFullscreen}
                    hasSatelliteIndicator={hasSatelliteIndicator}
                    hasCoverageSwitcher={hasCoverageSwitcher}
                    hideHeader={selection.type === 'satellite'}
                />
            )}

            {!commercialMode && !displayPrefs.isCompactMap && !isPhone && !isMobileViewport && (satelliteScope === 'GEO' || satelliteScope === 'ALL') && (
                <GeoGroundSiteLegend />
            )}

            {/* Cesium Viewer */}
            <div ref={globeContainerRef} className="w-full h-full">
                <Viewer
                    full
                    ref={handleViewerRef}
                    baseLayer={false}
                    timeline={false}
                    animation={false}
                    shouldAnimate={true}
                    infoBox={false}
                    selectionIndicator={false}
                    homeButton={false}
                    navigationHelpButton={false}
                    sceneModePicker={false}
                    baseLayerPicker={false}
                    geocoder={false}
                    fullscreenButton={false}
                    vrButton={false}
                >
                    <ScreenSpaceEventHandler>
                        <ScreenSpaceEvent action={handleMapClick} type={ScreenSpaceEventType.LEFT_CLICK} />
                        {/* Shift+click is routed by Cesium to a separate modifier event — register it explicitly */}
                        <ScreenSpaceEvent action={handleMapClick} type={ScreenSpaceEventType.LEFT_CLICK} modifier={KeyboardEventModifier.SHIFT} />
                        <ScreenSpaceEvent action={handleMapHover} type={ScreenSpaceEventType.MOUSE_MOVE} />
                    </ScreenSpaceEventHandler>

                    {/* Regulatory overlay — country polygons coloured by simulated regulatory status */}
                    <RegulatoryLayer visible={!commercialMode && effectiveCountryOverlayMode === 'regulatory'} />
                    <FiveGSpectrumLayer visible={!commercialMode && effectiveCountryOverlayMode === '5g-spectrum'} />

                    {/* Network Load Layer */}
                    <FillRateLayer
                        visible={effectiveShowFillRateLayer}
                    />

                    {/* Aggregated Connectivity Layer (Bottom most coverage layer) */}
                    <AggregatedConnectivityLayer
                        satelliteScope={satelliteScope}
                        satellites={satellites}
                        show={!commercialMode && showAggregatedConnectivity}
                    />

                    <SelectedCountryOutline
                        visible={selectedRegulatoryCountryOutlineVisible}
                        countryName={selectedRegulatoryResult?.countryName ?? null}
                        countryCode={selectedRegulatoryResult?.isoA2 ?? null}
                        outlineColor={
                            selectedCountryOutlineStatus === 'BLOCKED'
                                ? '#ef4444'
                                : selectedCountryOutlineStatus === 'RESTRICTED'
                                    ? '#f97316'
                                    : selectedCountryOutlineStatus === 'ALLOWED_CONFIRMED'
                                        ? '#10b981'
                                        : selectedCountryOutlineStatus === 'ALLOWED_ESTIMATED'
                                            ? '#22c55e'
                                            : '#94a3b8'
                        }
                    />

                    {/* Coverage Layer — ANALYSIS LAYER
                        The key prop implements clearAnalysisLayer() + drawNewCoverage():
                        when the key changes React fully unmounts the old layer (removing
                        all Cesium entities) then mounts a fresh one. This guarantees
                        zero entity accumulation across selection transitions.

                        Key composition rules:
                          • satellite-inspection mode  → sat::<id>::<beam>::<coverage>
                            Changes when the user selects a different satellite or
                            drills into a beam/coverage within the same satellite.
                          • analysis mode (position/aircraft/vessel)
                            → pos::<satelliteId>::<coverageKey>
                            Changes whenever the best coverage changes, even if the
                            satellite is the same (different beam selected).
                          • no selection → 'none'
                            Key differs from every data key, so if candidates arrive
                            later the layer WILL remount cleanly.

                        IMPORTANT: the key is NEVER 'empty' — that string was used
                        previously and caused a silent no-remount bug when candidates
                        arrived after clearing. */}
                    {(!commercialMode || commercialGeoCoverageVisible) && (
                        <CoverageLayer
                            satellites={satellites}
                            selection={selection}
                            selectedCoverage={selectedCoverage}
                            selectedUplinkCoverage={selectedUplinkCoverage}
                            selectedDownlinkCoverage={selectedDownlinkCoverage}
                            visibleCoverageKeys={commercialMode ? null : visibleGeoCoverageKeys}
                            onLegendItemsChange={commercialMode ? undefined : handleGeoCoverageLegendItemsChange}
                            highlightedLegendItemKey={commercialMode ? null : focusedGeoCoverageLegendKey}
                            presentation={commercialMode ? 'commercial' : 'engineering'}
                            commercialLabel={commercialGeoCoverageLabel}
                            commercialTone={commercialMode && (!commercialSatelliteFocused || commercialDominantTechnology !== 'GEO') ? 'secondary' : 'primary'}
                            commercialHero={commercialGeoSatelliteFocused}
                        />
                    )}

                    {!commercialMode && <MoonLayer enableLighting={enableLighting} selected={selectedMoon} />}

                    {/* OneWeb Comb Layer - Engineering shows operational beam context.
                        Commercial keeps the LEO service footprint visible across
                        the journey when LEO has been evaluated, without satellite icons. */}
                    {(
                        !commercialMode
                        || (commercialLeoOptionEvaluated && satelliteScope !== 'GEO')
                    ) && oneWebVisualTargets.map((target) => (
                        <OneWebCombLayer
                            key={`oneweb-comb-${target.satellite.id}`}
                            targetSat={target.satellite}
                            viewerRef={viewerRef}
                            selectedPosition={target.servingPoints ? null : selectedPosition}
                            selectedAircraft={target.servingPoints ? null : selectedAircraft}
                            servingPoints={target.servingPoints ?? undefined}
                            commercialProjectionOrigin={target.commercialProjectionOrigin}
                            highlightServingFootprint={(!selectedSatellite || commercialMode) && (!commercialMode || (commercialSatelliteFocused && commercialDominantTechnology === 'LEO')) && (
                                target.servingPoints ? target.servingPoints.length > 0 : !!autoSelectedLEOSatellite
                            )}
                            regulatoryOverlayActive={effectiveCountryOverlayMode === 'regulatory'}
                            leoServiceViewModel={leoServiceViewModel}
                            commercialTone={commercialMode && (!commercialSatelliteFocused || commercialDominantTechnology !== 'LEO') ? 'secondary' : 'primary'}
                            commercialEnvelopeOnly={commercialMode}
                            commercialOpacityScale={commercialMode && commercialSatelliteFocused && commercialDominantTechnology === 'LEO' ? 0.32 : 1}
                            showCommercialProjectionPanels={!commercialMode || (commercialSatelliteFocused && commercialDominantTechnology === 'LEO')}
                        />
                    ))}

                    {/* Aggregated coverage volume (manual satellite selection only) */}
                    {!commercialMode && showFootprintProjection && (
                        <AggregatedCoverageVolumeLayer
                            selectedSatellite={selectedSatellite}
                            selectedBeamFeature={geoBeamCone.beamFeature}
                            selectedCoverageFeatures={geoBeamCone.coverageFeatures}
                            selectedCoverageGroups={projectionCoverageGroups}
                            beamSatellite={geoBeamCone.sat}
                            autoSelectedSatellite={autoSelectedLEOSatellite}
                            selectedPosition={selectedPosition}
                            selectedAircraft={selectedAircraft}
                            satellites={satellites}
                            coverageFeatures={coverageFeatures}
                            viewerRef={viewerRef}
                        />
                    )}

                    {/* Transmission Links */}
                    {!commercialMode && (
                    <TransmissionLinks
                        satellites={satellites}
                        selectedPosition={selectedPosition}
                        pointB={pointB}
                        leoSiteToSiteResult={leoSiteToSiteResult}
                        linkMode={linkMode}
                        activeMeshTab={activeMeshTab}
                        selectedAircraft={selectedAircraft}
                        selectedSatellite={selectedSatellite}
                        autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                        autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                        selectedSNP={typeof selectedSNP === 'string' ? { lat: 0, lng: 0, name: selectedSNP } : selectedSNP}
                        selectedGateway={selectedGateway}
                        dedicatedSNPForSelectedLEO={dedicatedSNPForSelectedLEO}
                        satelliteScope={satelliteScope}
                        inspectedSNP={inspectedSNP}
                        snpConnectedSatellites={snpConnectedSatellites}
                        leoServiceViewModel={leoServiceViewModel}
                        resolvedAutoGeoGateway={resolvedAutoGeoGateway}
                        resolvedSelectedGeoGateway={resolvedSelectedGeoGateway}
                        showFlowAnimation={!commercialMode && showFlowAnimation}
                        cameraMetricsRef={cameraMetricsRef}
                        commercialMode={commercialMode}
                        commercialFocusedSegment={commercialFocusedSegment}
                        commercialRouteAvailable={commercialActiveRouteAvailable}
                        commercialDisplayTechnology={commercialMode ? commercialDominantTechnology : null}
                        commercialLeoRouteAvailable={commercialLeoOptionAvailable}
                        commercialGeoRouteAvailable={commercialGeoOptionAvailable}
                        narrativeLayerActive={commercialMode && !!commercialRouteModel}
                    />
                    )}

                    {/* Selected Position Marker — Point A */}
                    {showGroundSelectedPoint && selectedPosition && !commercialMode && (
                        <SelectedPointStatusMarker
                            selectedPosition={selectedPosition}
                            pixelSize={commercialAccessFocused || commercialSummaryFocused || commercialGeoSatelliteFocused ? commercialFocusPointPixelSize : positionMarkerPixelSize}
                            satelliteScope={satelliteScope}
                            leoServiceViewModel={leoServiceViewModel}
                            geoPointStatus={geoPointStatus}
                        />
                    )}

                    {/* Site B marker — rendered once regardless of how many active topologies use it */}
                    {siteBMarkerPosition && !commercialMode && (
                        <SelectedPointStatusMarker
                            selectedPosition={siteBMarkerPosition}
                            pixelSize={commercialDestinationFocused || commercialSummaryFocused ? commercialFocusPointBPixelSize : pointBMarkerPixelSize}
                            satelliteScope={
                                pointB && pointBLeo ? 'ALL' :
                                pointB ? 'GEO' : 'LEO'
                            }
                            leoServiceViewModel={null}
                            geoPointStatus={pointB ? geoPointStatus : null}
                            markerVariant="site-b"
                        />
                    )}
                    {!commercialMode && activeEndpointPulse && (() => {
                        const pulsePosition = activeEndpointPulse.role === 'origin'
                            ? selectedPosition
                            : siteBMarkerPosition;
                        if (!pulsePosition) return null;
                        return (
                            <SelectionPulseMarker
                                key={`endpoint-selection-pulse-${activeEndpointPulse.role}-${activeEndpointPulse.token}`}
                                position={getPosition(pulsePosition.lat, pulsePosition.lng, GROUND_POINT_ALTITUDE_KM)}
                                baseColor={activeEndpointPulse.role === 'origin' ? Color.fromCssColorString('#22d3ee') : Color.fromCssColorString('#ec4899')}
                                pulseSpeed={1.25}
                                ringBaseRadius={46000}
                                opacityMultiplier={0.72}
                            />
                        );
                    })()}
                    {!commercialMode && pulsedSatellites.map((satellite) => {
                        const isLeoSatellite = satellite.type === 'ONEWEB';
                        const baseRadius = isLeoSatellite ? 20000 : 32000;
                        const displayTech = commercialMode ? commercialDominantTechnology : null;
                        const isSecondaryTech = displayTech !== null && (
                            (isLeoSatellite && displayTech === 'GEO') ||
                            (!isLeoSatellite && displayTech === 'LEO')
                        );
                        const isNoDominantCommercialTech = commercialMode && displayTech === null;
                        const pulseColor = !commercialMode && selectedSatellite?.id === satellite.id
                            ? Color.RED
                            : isSecondaryTech || isNoDominantCommercialTech
                                ? Color.fromCssColorString('#64748b')
                                : isLeoSatellite
                                    ? Color.DEEPPINK
                                    : Color.ROYALBLUE;
                        return (
                        <SelectionPulseMarker
                            key={`selection-pulse-satellite-${satellite.id}`}
                            position={getSatellitePositionCallback(satellite)}
                            anchorType="orbital"
                            baseColor={pulseColor}
                            ringBaseRadius={commercialMode ? Math.round(baseRadius * (isSecondaryTech || isNoDominantCommercialTech ? 0.24 : 0.36)) : baseRadius}
                            opacityMultiplier={commercialMode ? (isSecondaryTech || isNoDominantCommercialTech ? 0.16 : 0.28) : 1}
                        />
                        );
                    })}
                    {pulsedSnp && (!commercialMode || commercialBackhaulFocused) && (
                        <SelectionPulseMarker
                            key={`selection-pulse-snp-${pulsedSnp.name}`}
                            position={getPosition(pulsedSnp.lat, pulsedSnp.lng, GROUND_POINT_ALTITUDE_KM)}
                            baseColor={commercialMode && (commercialFocusedSegment !== 'backhaul' || commercialDominantTechnology !== 'LEO') ? Color.fromCssColorString('#64748b') : Color.ORANGE}
                            ringBaseRadius={commercialMode ? (commercialFocusedSegment === 'backhaul' && commercialDominantTechnology === 'LEO' ? 28000 : 12000) : 36000}
                            opacityMultiplier={commercialMode ? (commercialFocusedSegment === 'backhaul' && commercialDominantTechnology === 'LEO' ? 0.65 : 0.18) : 1}
                        />
                    )}
                    {pulsedGateway && (!commercialMode || commercialBackhaulFocused) && linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT' && (
                        <SelectionPulseMarker
                            key={`selection-pulse-gateway-${pulsedGateway.name}`}
                            position={getPosition(pulsedGateway.lat, pulsedGateway.lng, GROUND_POINT_ALTITUDE_KM)}
                            baseColor={commercialMode && (commercialFocusedSegment !== 'backhaul' || commercialDominantTechnology !== 'GEO') ? Color.fromCssColorString('#64748b') : Color.CYAN}
                            ringBaseRadius={commercialMode ? (commercialFocusedSegment === 'backhaul' && commercialDominantTechnology === 'GEO' ? 28000 : 12000) : 36000}
                            opacityMultiplier={commercialMode ? (commercialFocusedSegment === 'backhaul' && commercialDominantTechnology === 'GEO' ? 0.65 : 0.18) : 1}
                        />
                    )}

                    {/* Satellite Layer */}
                    {!commercialMode && (
                        <SatelliteLayer
                            satellites={satellitesForLayer}
                            selectedSatellite={selectedSatellite}
                            onSatelliteClick={onSatelliteClick}
                            onSatelliteHover={handleSatelliteHover}
                            viewerRef={viewerRef}
                            cameraMetricsRef={cameraMetricsRef}
                            satelliteSizeScale={sizeScale}
                        />
                    )}

                    {/* Commercial Symbolic Connectivity Layer — business route story. */}
                    {commercialMode && commercialRouteModel && (
                        <CommercialSymbolicConnectivityLayer
                            routeModel={commercialRouteModel}
                            viewerRef={viewerRef}
                            cameraMetricsRef={cameraMetricsRef}
                            sizeScale={sizeScale}
                            routeHeroMode={isPhone || isMobileViewport}
                        />
                    )}

                    {/* Flight coverage ribbon — COMM mode + aircraft selected.
                        Coloured polyline showing 2-hour projected path with LEO
                        coverage quality (excellent/good/marginal/gap). */}
                    {commercialMode && (
                        <FlightCoverageRibbon
                            aircraft={selectedAircraft}
                            satellites={satellites}
                            show={!!selectedAircraft}
                        />
                    )}

                    {(!commercialMode || commercialBackhaulFocused) && (
                        <>
                            {/* SNP Layer */}
                            <SnpLayer
                                satelliteScope={satelliteScope}
                                onSnpClick={onSnpClick}
                                onSnpHover={handleSnpHover}
                                viewerRef={viewerRef}
                                cameraMetricsRef={cameraMetricsRef}
                                sizeScale={sizeScale}
                                autoSelectedSnpName={typeof selectedSNP === 'string' ? selectedSNP : (selectedSNP?.name ?? null)}
                                inspectedSnpName={inspectedSNP?.name ?? null}
                                allowedSnpNames={commercialSnpAllowlist}
                                commercialTone={commercialMode ? 'secondary' : 'primary'}
                                showLabels={!commercialMode}
                            />

                            {/* GEO Gateway Layer */}
                            <GeoGatewayLayer
                                satelliteScope={satelliteScope}
                                onGatewayClick={onGatewayClick ?? (() => {})}
                                onGatewayHover={handleGatewayHover}
                                viewerRef={viewerRef}
                                cameraMetricsRef={cameraMetricsRef}
                                selectedGatewayName={selectedGeoGatewayName}
                                sizeScale={sizeScale}
                                allowedGatewayNames={commercialGatewayAllowlist}
                                commercialTone={commercialMode ? 'secondary' : 'primary'}
                                renderMode={commercialMode ? 'commercial' : 'engineering'}
                                showLabels={!commercialMode}
                            />
                        </>
                    )}

                    {/* Trajectory Layer */}
                    <TrajectoryLayer
                        satellite={selectedSatellite}
                        show={!commercialMode && showSatelliteTrajectory}
                    />

                    {/* Aircraft Layer */}
                    {!commercialMode && airTrafficEnabled && (
                        <AircraftLayer
                            aircraft={aircraft}
                            selectedAircraft={selectedAircraft}
                            onAircraftClick={onAircraftClick}
                            onAircraftHover={handleAircraftHover}
                            viewerRef={viewerRef}
                            cameraMetricsRef={cameraMetricsRef}
                            aircraftSizeScale={sizeScale}
                            interpolatedAircraftMapRef={interpolatedAircraftMapRef}
                        />
                    )}

                    {/* Vessel Layer */}
                    {!commercialMode && maritimeTrafficEnabled && (
                        <VesselLayer
                            vessels={vessels}
                            selectedVessel={selectedVessel}
                            onVesselClick={onVesselClick}
                            onVesselHover={handleVesselHover}
                            viewerRef={viewerRef}
                            cameraMetricsRef={cameraMetricsRef}
                            vesselSizeScale={sizeScale}
                            interpolatedVesselMapRef={interpolatedVesselMapRef}
                        />
                    )}

                    {/* ISS Live Layer */}
                    <IssLayer
                        positionRef={issPositionRef ?? emptyIssPositionRef}
                        orbitPath={issOrbitPath}
                        hasPosition={issHasPosition}
                        isSelected={issIsSelected}
                        isFollowing={issIsFollowing}
                        enabled={!commercialMode && issLiveEnabled}
                        onIssClick={onIssClick ?? (() => {})}
                        viewerRef={viewerRef}
                        cameraMetricsRef={cameraMetricsRef}
                    />
                </Viewer>
            </div>

            {!commercialMode && !isPhone && (
                <InspectionCard
                    entity={hoveredEntity}
                    containerRef={globeContainerRef}
                    cursorPositionRef={inspectionCursorPositionRef}
                />
            )}
            {/* Unified Site A tooltip — aggregates GEO and LEO data in one bubble */}
            {commercialMode ? (() => {
                if (!showCommercialSiteALabel) return null;
                if (!showGroundSelectedPoint || !selectedPosition || !commercialViewModel) return null;
                // Use access-segment status so the tooltip matches the Journey Strip card.
                // Fall back to overall service status only when no segment data is available.
                const accessSegment = commercialViewModel.routeSegments.find(s => s.type === 'access');
                const accessStatus = accessSegment?.status as CommercialSegmentStatus | undefined
                    ?? (commercialViewModel.serviceStatus === 'active' ? 'healthy'
                       : commercialViewModel.serviceStatus === 'degraded' ? 'warning'
                       : commercialViewModel.serviceStatus === 'blocked' ? 'blocked'
                       : undefined);
                const { tone: siteATone, label: siteALabel } = commercialSegmentDisplay(accessStatus);
                // Use site-level throughput; show as "ms Latency" (not RTT).
                const performanceLine = [
                    commercialViewModel.downloadMbps ? `${Math.round(commercialViewModel.downloadMbps)} Mbps` : null,
                    commercialViewModel.rttMs ? `${Math.round(commercialViewModel.rttMs)} ms Latency` : null,
                ].filter(Boolean).join(' · ');
                const narrativeText = accessSegment?.story ?? commercialViewModel.serviceMessage ?? siteALabel;
                return (
                    <SiteScreenLabel
                        siteId="A"
                        position={selectedPosition}
                        viewerRef={viewerRef}
                        containerRef={globeContainerRef}
                        viewerReady={viewerReady}
                        compact={!!isPhone}
                        collisionSide={siteLabelsAreClose ? 'left' : 'center'}
                        titleOverride={`Site A${commercialViewModel.siteA?.name ? ` · ${commercialViewModel.siteA.name}` : ''}`}
                        presentation="commercial"
                        sections={[{
                            title: siteALabel,
                            accent: 'pink',
                            lines: [
                                { text: narrativeText, tone: siteATone },
                                ...(performanceLine ? [{ text: performanceLine, tone: 'success' as const }] : []),
                            ],
                        }]}
                    />
                );
            })() : (() => {
                if (hideSiteScreenLabels || !showGroundSelectedPoint || !selectedPosition) return null;
                const s2sResult = leoSiteToSiteFullResult ?? leoSiteToSiteResult;
                const isMeshP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
                const isLeoS2S = !!pointBLeo;
                const sections = [];

                if (satelliteScope !== 'LEO') {
                    sections.push(
                        isMeshP2P
                            ? buildGeoMeshSection(performanceMetrics?.mesh, 'A', linkMode!, autoSelectedGEOSatellite?.name)
                            : buildGeoStarSection(geoPointStatus, performanceMetrics?.geo, linkMode, autoSelectedGEOSatellite?.name)
                    );
                }
                if (satelliteScope !== 'GEO') {
                    sections.push(
                        isLeoS2S
                            ? buildLeoS2SSectionA(s2sResult)
                            : buildLeoSingleSection(leoServiceViewModel, performanceMetrics?.leo, autoSelectedLEOSatellite?.name)
                    );
                }

                return (
                    <SiteScreenLabel
                        siteId="A"
                        position={selectedPosition}
                        viewerRef={viewerRef}
                        containerRef={globeContainerRef}
                        viewerReady={viewerReady}
                        compact={!!isPhone}
                        collisionSide={siteLabelsAreClose ? 'left' : 'center'}
                        selectionMotionKey={endpointSelectionMotion?.role === 'origin' ? endpointSelectionMotion.token : undefined}
                        sections={sections}
                    />
                );
            })()}
            {/* Unified Site B tooltip — aggregates GEO Mesh/P2P and/or LEO S2S in one bubble */}
            {commercialMode ? (() => {
                if (!showCommercialSiteBLabel) return null;
                if (hideSiteScreenLabels) return null;
                const siteBPos = pointB ?? pointBLeo;
                if (!siteBPos || !commercialViewModel) return null;
                // Use destination-segment status so the tooltip matches the Journey Strip card.
                const destinationSegment = commercialViewModel.routeSegments.find(s => s.type === 'destination');
                const destinationStatus = destinationSegment?.status as CommercialSegmentStatus | undefined
                    ?? (commercialViewModel.serviceStatus === 'active' ? 'healthy'
                       : commercialViewModel.serviceStatus === 'degraded' ? 'warning'
                       : commercialViewModel.serviceStatus === 'blocked' ? 'blocked'
                       : undefined);
                const { tone: siteBTone, label: siteBLabel } = commercialSegmentDisplay(destinationStatus);
                // Show as "ms Latency" (not RTT).
                const performanceLine = [
                    commercialViewModel.uploadMbps ? `${Math.round(commercialViewModel.uploadMbps)} Mbps` : null,
                    commercialViewModel.rttMs ? `${Math.round(commercialViewModel.rttMs)} ms Latency` : null,
                ].filter(Boolean).join(' · ');
                const narrativeText = destinationSegment?.story ?? commercialViewModel.serviceMessage ?? siteBLabel;
                // Outcome highlight (Part F): brief glow on Site B after the
                // route reveal completes.  Status maps to emerald/amber/red.
                const outcomeHighlight: 'active' | 'limited' | 'blocked' | undefined =
                    commercialViewModel.serviceStatus === 'active'  ? 'active'  :
                    commercialViewModel.serviceStatus === 'degraded' ? 'limited' :
                    commercialViewModel.serviceStatus === 'blocked'  ? 'blocked' :
                    undefined;

                return (
                    <SiteScreenLabel
                        siteId="B"
                        position={siteBPos}
                        viewerRef={viewerRef}
                        containerRef={globeContainerRef}
                        viewerReady={viewerReady}
                        compact={!!isPhone}
                        collisionSide={siteLabelsAreClose ? 'right' : 'center'}
                        titleOverride={`Site B${commercialViewModel.siteB?.name ? ` · ${commercialViewModel.siteB.name}` : ''}`}
                        presentation="commercial"
                        outcomeHighlight={outcomeHighlight}
                        sections={[{
                            title: siteBLabel,
                            accent: 'blue',
                            lines: [
                                { text: narrativeText, tone: siteBTone },
                                ...(performanceLine ? [{ text: performanceLine, tone: 'success' as const }] : []),
                            ],
                        }]}
                    />
                );
            })() : (() => {
                const siteBPos = pointB ?? pointBLeo;
                if (!siteBPos) return null;
                const s2sResult = leoSiteToSiteFullResult ?? leoSiteToSiteResult;
                const isMeshP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
                const isLeoS2S = !!pointBLeo;
                const sections = [];

                if (satelliteScope !== 'LEO' && pointB && isMeshP2P) {
                    sections.push(buildGeoMeshSection(performanceMetrics?.mesh, 'B', linkMode!, autoSelectedGEOSatellite?.name));
                }
                if (satelliteScope !== 'GEO' && isLeoS2S) {
                    sections.push(buildLeoS2SSectionB(s2sResult));
                }

                if (sections.length === 0) return null;

                return (
                    <SiteScreenLabel
                        siteId="B"
                        position={siteBPos}
                        viewerRef={viewerRef}
                        containerRef={globeContainerRef}
                        viewerReady={viewerReady}
                        compact={!!isPhone}
                        collisionSide={siteLabelsAreClose ? 'right' : 'center'}
                        selectionMotionKey={endpointSelectionMotion?.role === 'destination' ? endpointSelectionMotion.token : undefined}
                        sections={sections}
                    />
                );
            })()}
            {/* Bottom path strip follows the selected sidebar topology tab.
                Suppressed while the Engineering Analysis workspace is open — the same
                strip is rendered inside the workspace sidebar there instead, where it
                has room to breathe instead of competing with the reduced globe height. */}
            {!commercialMode && !displayPrefs.hideBottomPathStrip && (() => {
                if (activeConnectivityTab === 'GEO') {
                    const mesh = performanceMetrics?.mesh ?? null;
                    const activeDirection = activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B';
                    if (!mesh || (linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT')) return null;
                    return (
                        <GeoS2SPathStrip
                            mesh={mesh}
                            activeDirection={activeDirection}
                            path={performanceMetrics?.geoSiteToSitePath ?? null}
                            linkMode={linkMode}
                        />
                    );
                }

                const s2sResult = leoSiteToSiteFullResult ?? leoSiteToSiteResult;
                if (activeConnectivityTab !== 'LEO') return null;
                if (!s2sResult?.serviceAvailable) return null;
                return (
                    <LeoS2SPathStrip
                        result={s2sResult}
                        activeDirection={activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B'}
                    />
                );
            })()}
            {!hideSatelliteScreenLabels && !commercialMode && (
                <SatelliteScreenLabels
                    viewerRef={viewerRef}
                    containerRef={globeContainerRef}
                    highlightedSatellites={highlightedSatelliteLabels}
                    viewerReady={viewerReady}
                    presentation={commercialMode ? 'commercial' : 'engineering'}
                    isMobileViewport={isMobileViewport}
                />
            )}
            {/* Interaction hint — shown only when MESH/P2P mode is active */}
            {!commercialMode && (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                    {!pointB ? (
                        <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-4 py-1.5 text-white text-xs shadow-lg">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                            Hold <kbd className="mx-0.5 rounded bg-white/20 px-1 font-mono text-[10px]">Shift</kbd> + click to place <strong>Site B</strong>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-4 py-1.5 text-white text-xs shadow-lg">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-400 shrink-0" />
                            Click the globe (no Shift) to move <strong>Site A</strong>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(CesiumGlobe);
