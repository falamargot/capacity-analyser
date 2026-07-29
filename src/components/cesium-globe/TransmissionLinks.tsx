/**
 * TransmissionLinks - Renders satellite/aircraft communication links
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Entity, PolylineGraphics, PointGraphics, LabelGraphics, useCesium } from 'resium';
import { requestGlobeRender } from '../../utils/globeRenderRequest';
import { useStableRoutePositions } from './stableRoutePositions';
import {
    Color,
    CallbackProperty,
    CallbackPositionProperty,
    JulianDate,
    Cartesian3,
    PolylineDashMaterialProperty,
    PolylineGlowMaterialProperty,
    ArcType,
    Cartographic,
    Math as CesiumMath,
    Cartesian2,
    VerticalOrigin,
    HorizontalOrigin,
    LabelStyle,
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { getPosition, calculateDeadReckoning, propagateSatellite } from './utils';
import { hasRFConnectivity } from '../../utils/rfConnectivity';
import { useSimulation } from '../../contexts/SimulationContext';
import { GEO_GATEWAYS, type GeoGatewayData, type SNPData } from '../globe/GlobeConfig';
import {
    getMonitoredGeoSatellitesForGateway,
    type ResolvedGeoGateway,
} from '../../utils/geoConnectivityModel';
import type { SNPConnectedSatellite } from '../../services/coverageService';
import { buildSimulationStateSnapshot } from '../../types/simulation';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { RegulatoryBlockedPathMaterialProperty } from './materials/regulatoryMaterials';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import PathFlowAnimation, { type PathSegment } from './PathFlowAnimation';
import type { CameraMetricsSnapshot } from './utils';
import type { CommercialRouteSegmentType } from '../commercial/commercialViewModel';
import { GROUND_POINT_ALTITUDE_KM } from './layerHeights';
import { useEngineeringFocus } from '../../contexts/EngineeringFocusContext';
import {
    getEngineeringLegAnnotation,
    getEngineeringLegVisualState,
    type EngineeringPathVisualState,
    type EngineeringRouteLeg,
} from '../../utils/engineeringFocusModel';

interface TransmissionLinksProps {
    satellites: SatelliteData[];
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    pointB?: { lat: number; lng: number } | null;
    /** LEO site-to-site result — when present, draws the full routed path on the globe. */
    leoSiteToSiteResult?: LeoSiteToSiteResult | null;
    linkMode?: string;
    /** Active direction tab in MESH/P2P — drives which leg is styled as transmit vs receive. */
    activeMeshTab?: 'forward' | 'reverse';
    selectedAircraft?: Aircraft | null;
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    selectedSNP?: { lat: number; lng: number; name: string } | null;
    selectedGateway?: GeoGatewayData | null;
    dedicatedSNPForSelectedLEO?: SNPData | null;
    satelliteScope: SatelliteScope;
    inspectedSNP?: SNPData | null;
    snpConnectedSatellites?: SNPConnectedSatellite[];
    leoServiceViewModel?: LeoConnectivityViewModel | null;
    resolvedAutoGeoGateway?: ResolvedGeoGateway | null;
    resolvedSelectedGeoGateway?: ResolvedGeoGateway | null;
    showFlowAnimation?: boolean;
    cameraMetricsRef?: React.RefObject<CameraMetricsSnapshot>;
    commercialMode?: boolean;
    commercialFocusedSegment?: CommercialRouteSegmentType;
    commercialRouteAvailable?: boolean;
    /** Presentation-only: which technology is the primary commercial story. */
    commercialDisplayTechnology?: 'LEO' | 'GEO' | null;
    /** Per-technology route availability — when provided, overrides commercialRouteAvailable for LEO links. */
    commercialLeoRouteAvailable?: boolean;
    /** Per-technology route availability — when provided, overrides commercialRouteAvailable for GEO links. */
    commercialGeoRouteAvailable?: boolean;
    /** When true, CommercialRouteLayer is the primary visual — reduce all link
     *  widths to 30 % so legacy links recede into the background. */
    narrativeLayerActive?: boolean;
}

// Dashed material cache
const leoAllowedMaterial = new PolylineGlowMaterialProperty({
    color: Color.PALEVIOLETRED.withAlpha(0.92),
    glowPower: 0.12,
    taperPower: 0.58,
});

const geoUserMaterial = new PolylineDashMaterialProperty({
    color: Color.ROYALBLUE,
    dashPattern: 3855
});
const geoUserSecondaryMaterial = new PolylineDashMaterialProperty({
    color: Color.ROYALBLUE.withAlpha(0.34),
    gapColor: Color.ROYALBLUE.withAlpha(0.04),
    dashPattern: 3855
});

const geoFeederMaterial = new PolylineDashMaterialProperty({
    color: Color.ROYALBLUE,
    dashPattern: 3855
});
const geoFeederSecondaryMaterial = new PolylineDashMaterialProperty({
    color: Color.ROYALBLUE.withAlpha(0.32),
    gapColor: Color.ROYALBLUE.withAlpha(0.04),
    dashPattern: 3855
});

const geoBackhaulMaterial = new PolylineDashMaterialProperty({
    color: Color.GRAY,
    dashPattern: 3855
});
const geoBackhaulSecondaryMaterial = new PolylineDashMaterialProperty({
    color: Color.GRAY.withAlpha(0.3),
    gapColor: Color.GRAY.withAlpha(0.04),
    dashPattern: 3855
});

const pointToPointMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#f59e0b').withAlpha(0.95),
    glowPower: 0.18,
    taperPower: 0.35,
});

// MESH/P2P full-path glow — colours the long Sat link so it's visible at any zoom.
// Transmit leg: orange glow
const meshTransmitMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#f97316').withAlpha(0.98),
    glowPower: 0.28,
    taperPower: 0.5,
});
const meshTransmitSecondaryMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#f97316').withAlpha(0.34),
    glowPower: 0.08,
    taperPower: 0.5,
});
// Receive leg: cyan glow
const meshReceiveMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#06b6d4').withAlpha(0.98),
    glowPower: 0.28,
    taperPower: 0.5,
});
const meshReceiveSecondaryMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#06b6d4').withAlpha(0.34),
    glowPower: 0.08,
    taperPower: 0.5,
});


// STAR_RETURN: user transmits → amber dashed (vs STAR_FORWARD blue)
const geoUplinkMaterial = new PolylineDashMaterialProperty({
    color: Color.fromCssColorString('#f59e0b').withAlpha(0.9),
    dashPattern: 3855,
});
const geoUplinkSecondaryMaterial = new PolylineDashMaterialProperty({
    color: Color.fromCssColorString('#f59e0b').withAlpha(0.32),
    gapColor: Color.fromCssColorString('#78350f').withAlpha(0.05),
    dashPattern: 3855,
});

const blockedDiagnosticMaterial = new RegulatoryBlockedPathMaterialProperty({
    color: Color.fromCssColorString('#fb7185').withAlpha(0.95),
    stopColor: Color.fromCssColorString('#fecdd3').withAlpha(0.98),
    alphaMultiplier: 0.98,
});

const degradedMaterial = new PolylineDashMaterialProperty({
    color: Color.fromCssColorString('#f59e0b').withAlpha(0.9),
    gapColor: Color.fromCssColorString('#78350f').withAlpha(0.12),
    dashPattern: 3855,
});

// ── LEO site-to-site materials ────────────────────────────────────────────────
// Cyan glow: user access links (UT ↔ Satellite)
const s2sUserLinkMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#06b6d4').withAlpha(0.95),
    glowPower: 0.22,
    taperPower: 0.5,
});
const s2sUserLinkSecondaryMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#06b6d4').withAlpha(0.34),
    glowPower: 0.07,
    taperPower: 0.5,
});
// Orange glow: feeder links (Satellite ↔ SNP)
const s2sFeederLinkMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#f97316').withAlpha(0.92),
    glowPower: 0.18,
    taperPower: 0.5,
});
const s2sFeederLinkSecondaryMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#f97316').withAlpha(0.32),
    glowPower: 0.06,
    taperPower: 0.5,
});
// Violet dashed: terrestrial backbone (SNP ↔ PoP)
const s2sBackboneMaterial = new PolylineDashMaterialProperty({
    color: Color.fromCssColorString('#a78bfa').withAlpha(0.96),
    gapColor: Color.fromCssColorString('#2e1065').withAlpha(0.16),
    dashPattern: 3855,
});
const s2sBackboneSecondaryMaterial = new PolylineDashMaterialProperty({
    color: Color.fromCssColorString('#a78bfa').withAlpha(0.34),
    gapColor: Color.fromCssColorString('#2e1065').withAlpha(0.04),
    dashPattern: 3855,
});
const s2sBackboneHaloMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#020617').withAlpha(0.72),
    glowPower: 0.16,
    taperPower: 0.35,
});
const s2sBackboneHaloSecondaryMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#020617').withAlpha(0.38),
    glowPower: 0.08,
    taperPower: 0.35,
});
const s2sBackboneGlowMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#8b5cf6').withAlpha(0.48),
    glowPower: 0.24,
    taperPower: 0.45,
});
const s2sBackboneGlowSecondaryMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#8b5cf6').withAlpha(0.16),
    glowPower: 0.08,
    taperPower: 0.45,
});
const leoRouteHaloMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#020617').withAlpha(0.76),
    glowPower: 0.18,
    taperPower: 0.38,
});
const leoRouteHaloSecondaryMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#020617').withAlpha(0.44),
    glowPower: 0.1,
    taperPower: 0.38,
});

const S2S_BACKBONE_HALO_WIDTH = 8;
const S2S_BACKBONE_GLOW_WIDTH = 6;
const S2S_BACKBONE_MAIN_WIDTH = 3.8;
const flowGeoForwardColor = Color.ROYALBLUE;
const flowGeoReturnColor = Color.fromCssColorString('#f59e0b');
const flowMeshTransmitColor = Color.fromCssColorString('#f97316');
const flowMeshReceiveColor = Color.fromCssColorString('#06b6d4');
const flowLeoUserColor = Color.fromCssColorString('#06b6d4');
const flowLeoFeederColor = Color.fromCssColorString('#f97316');
const flowBackboneColor = Color.fromCssColorString('#a78bfa');

const getRouteSurfacePosition = (lat: number, lng: number, altitudeKm = 0) => (
    getPosition(lat, lng, Math.max(altitudeKm, GROUND_POINT_ALTITUDE_KM))
);

const entityIdPart = (value: string | number | null | undefined) => (
    String(value ?? 'none')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'none'
);

const buildEntityId = (...parts: Array<string | number | null | undefined>) => (
    parts.map(entityIdPart).join('-')
);

type RouteLineMaterial = PolylineGlowMaterialProperty | PolylineDashMaterialProperty | RegulatoryBlockedPathMaterialProperty;

interface HighlightedRouteSegmentProps {
    name: string;
    positions: CallbackProperty;
    width: number;
    material: RouteLineMaterial;
    entityIdBase: string;
    clampToGround?: boolean;
    arcType?: ArcType;
    subdued?: boolean;
    /** When false, the entities stay mounted (avoiding Resium mount/unmount churn
     *  for data that flips availability routinely) but are hidden via Cesium's
     *  native `show`, not removed from the JSX tree. Defaults to true. */
    show?: boolean;
    visualState?: EngineeringPathVisualState;
}

const engineeringSelectedMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#38bdf8').withAlpha(0.98),
    glowPower: 0.24,
    taperPower: 0.42,
});
const engineeringLimitingMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#f59e0b').withAlpha(0.96),
    glowPower: 0.2,
    taperPower: 0.46,
});
const engineeringDiagnosticMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#94a3b8').withAlpha(0.58),
    glowPower: 0.08,
    taperPower: 0.5,
});
const engineeringSecondaryMaterial = new PolylineGlowMaterialProperty({
    color: Color.fromCssColorString('#94a3b8').withAlpha(0.18),
    glowPower: 0.025,
    taperPower: 0.55,
});
const engineeringUnavailableMaterial = new PolylineDashMaterialProperty({
    color: Color.fromCssColorString('#fb7185').withAlpha(0.95),
    gapColor: Color.fromCssColorString('#7f1d1d').withAlpha(0.12),
    dashPattern: 0x3f3f,
});
const engineeringUnresolvedMaterial = new PolylineDashMaterialProperty({
    color: Color.fromCssColorString('#94a3b8').withAlpha(0.76),
    gapColor: Color.TRANSPARENT,
    dashPattern: 0x1111,
});
const engineeringCandidateMaterial = new PolylineDashMaterialProperty({
    color: Color.fromCssColorString('#cbd5e1').withAlpha(0.75),
    gapColor: Color.TRANSPARENT,
    dashPattern: 0x00ff,
});

const materialForEngineeringState = (
    state: EngineeringPathVisualState | undefined,
    fallback: RouteLineMaterial,
): RouteLineMaterial => {
    if (state === 'selected') return engineeringSelectedMaterial;
    if (state === 'secondary') return engineeringSecondaryMaterial;
    if (state === 'limiting') return engineeringLimitingMaterial;
    if (state === 'diagnostic') return engineeringDiagnosticMaterial;
    if (state === 'unavailable') return engineeringUnavailableMaterial;
    if (state === 'unresolved') return engineeringUnresolvedMaterial;
    if (state === 'candidate') return engineeringCandidateMaterial;
    return fallback;
};

const widthForEngineeringState = (state: EngineeringPathVisualState | undefined, width: number) => (
    state === 'selected' ? width + 2.2
        : state === 'secondary' ? Math.max(0.8, width * 0.45)
        : state === 'limiting' || state === 'unavailable' ? width + 1.2
            : state === 'diagnostic' || state === 'unresolved' ? Math.max(1.5, width - 0.45)
                : width
);

const getRouteHaloWidth = (width: number) => Math.max(width + 4.8, width * 2.25);

const HighlightedRouteSegment = React.memo<HighlightedRouteSegmentProps>(({
    name,
    positions,
    width,
    material,
    entityIdBase,
    clampToGround = false,
    arcType = ArcType.NONE,
    subdued = false,
    show = true,
    visualState,
}) => {
    const haloMaterial = subdued || visualState === 'secondary' ? leoRouteHaloSecondaryMaterial : leoRouteHaloMaterial;
    const displayedWidth = widthForEngineeringState(visualState, width);
    const displayedMaterial = materialForEngineeringState(visualState, material);
    const failureEndPosition = useMemo(() => new CallbackPositionProperty((time, result) => {
        const values = positions.getValue(time);
        if (!Array.isArray(values) || values.length === 0) return undefined;
        return Cartesian3.clone(values[values.length - 1], result);
    }, false), [positions]);

    return (
        <>
            <Entity key={`${entityIdBase}-halo`} id={`${entityIdBase}-halo`} name={`${name} halo`} show={show}>
                <PolylineGraphics
                    positions={positions}
                    width={getRouteHaloWidth(displayedWidth)}
                    material={haloMaterial}
                    depthFailMaterial={haloMaterial}
                    clampToGround={clampToGround}
                    arcType={arcType}
                />
            </Entity>
            <Entity key={`${entityIdBase}-main`} id={`${entityIdBase}-main`} name={name} show={show}>
                <PolylineGraphics
                    positions={positions}
                    width={displayedWidth}
                    material={displayedMaterial}
                    depthFailMaterial={displayedMaterial}
                    clampToGround={clampToGround}
                    arcType={arcType}
                />
            </Entity>
            {/* Always mounted, visibility driven by `show` rather than JSX
                presence: toggling presence made this entity race its own
                deferred Resium removal on the next `unavailable` flip (see
                useStableRoutePositions). Hidden entities are skipped by
                Cesium's visualizers, so this costs nothing while inactive. */}
            <Entity
                key={`${entityIdBase}-failure`}
                id={`${entityIdBase}-failure`}
                name={`${name} failure boundary`}
                position={failureEndPosition}
                show={show && visualState === 'unavailable'}
            >
                <PointGraphics
                    pixelSize={11}
                    color={Color.fromCssColorString('#fb7185')}
                    outlineColor={Color.WHITE}
                    outlineWidth={2}
                    disableDepthTestDistance={Number.POSITIVE_INFINITY}
                />
                <LabelGraphics
                    text="×"
                    font="700 16px sans-serif"
                    fillColor={Color.WHITE}
                    outlineColor={Color.fromCssColorString('#881337')}
                    outlineWidth={3}
                    style={LabelStyle.FILL_AND_OUTLINE}
                    verticalOrigin={VerticalOrigin.CENTER}
                    horizontalOrigin={HorizontalOrigin.CENTER}
                    disableDepthTestDistance={Number.POSITIVE_INFINITY}
                />
            </Entity>
        </>
    );
});
HighlightedRouteSegment.displayName = 'HighlightedRouteSegment';

interface S2SBackboneSegmentProps {
    name: string;
    positions: CallbackProperty;
    widthBoost?: number;
    entityIdBase: string;
    subdued?: boolean;
    /** See HighlightedRouteSegmentProps.show. */
    show?: boolean;
    visualState?: EngineeringPathVisualState;
}

const S2SBackboneSegment = React.memo<S2SBackboneSegmentProps>(({
    name,
    positions,
    widthBoost = 0,
    entityIdBase,
    subdued = false,
    show = true,
    visualState,
}) => {
    const mainMaterial = materialForEngineeringState(
        visualState,
        subdued ? s2sBackboneSecondaryMaterial : s2sBackboneMaterial,
    );
    const widthBoostForState = visualState === 'selected' ? 2.2
        : visualState === 'limiting' || visualState === 'unavailable' ? 1.2
            : 0;
    return (
        <>
            <Entity key={`${entityIdBase}-halo`} id={`${entityIdBase}-halo`} name={`${name} halo`} show={show}>
                <PolylineGraphics
                    positions={positions}
                    width={S2S_BACKBONE_HALO_WIDTH + widthBoost + widthBoostForState}
                    material={subdued || visualState === 'secondary' ? s2sBackboneHaloSecondaryMaterial : s2sBackboneHaloMaterial}
                    depthFailMaterial={subdued || visualState === 'secondary' ? s2sBackboneHaloSecondaryMaterial : s2sBackboneHaloMaterial}
                    clampToGround={false}
                    arcType={ArcType.GEODESIC}
                />
            </Entity>
            <Entity key={`${entityIdBase}-glow`} id={`${entityIdBase}-glow`} name={`${name} glow`} show={show}>
                <PolylineGraphics
                    positions={positions}
                    width={S2S_BACKBONE_GLOW_WIDTH + widthBoost + widthBoostForState}
                    material={subdued || visualState === 'secondary' ? s2sBackboneGlowSecondaryMaterial : s2sBackboneGlowMaterial}
                    depthFailMaterial={subdued || visualState === 'secondary' ? s2sBackboneGlowSecondaryMaterial : s2sBackboneGlowMaterial}
                    clampToGround={false}
                    arcType={ArcType.GEODESIC}
                />
            </Entity>
            <Entity key={`${entityIdBase}-main`} id={`${entityIdBase}-main`} name={name} show={show}>
                <PolylineGraphics
                    positions={positions}
                    width={S2S_BACKBONE_MAIN_WIDTH + widthBoost + widthBoostForState}
                    material={mainMaterial}
                    depthFailMaterial={mainMaterial}
                    clampToGround={false}
                    arcType={ArcType.GEODESIC}
                />
            </Entity>
        </>
    );
});
S2SBackboneSegment.displayName = 'S2SBackboneSegment';

// Stable fallbacks for entities that stay mounted (show={false}) rather than being
// conditionally removed from the JSX tree — see the LEO S2S rendering block below.
// A shared singleton avoids allocating a new empty-array callback per render.
const EMPTY_POSITIONS_CALLBACK = new CallbackProperty(() => [], true);
const HIDDEN_ENTITY_POSITION = Cartesian3.ZERO;

const ANNOTATION_PIXEL_OFFSET = new Cartesian2(0, -14);
const ANNOTATION_OUTLINE_COLOR = Color.fromCssColorString('#0f172a');

/**
 * Midpoint label surfacing the focused cause stage's verdict on its mapped
 * route segment (text comes from getEngineeringSegmentAnnotation). Rendered
 * only while an analytical focus selects the segment, so mount churn tracks
 * user interaction, not orbital handoffs.
 */
const EngineeringSegmentAnnotation: React.FC<{
    entityId: string;
    text: string | null;
    positions: CallbackProperty;
    show?: boolean;
}> = ({ entityId, text, positions, show = true }) => {
    const midpointPosition = useMemo(() => new CallbackPositionProperty((time, result) => {
        const values = positions.getValue(time);
        if (!Array.isArray(values) || values.length < 2) return undefined;
        return Cartesian3.midpoint(values[0], values[values.length - 1], result ?? new Cartesian3());
    }, false), [positions]);

    if (!text) return null;
    return (
        <Entity key={entityId} id={entityId} name={text} position={midpointPosition} show={show}>
            <LabelGraphics
                text={text}
                font="600 11px sans-serif"
                fillColor={Color.WHITE}
                outlineColor={ANNOTATION_OUTLINE_COLOR}
                outlineWidth={4}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={ANNOTATION_PIXEL_OFFSET}
                verticalOrigin={VerticalOrigin.BOTTOM}
                horizontalOrigin={HorizontalOrigin.CENTER}
                disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
        </Entity>
    );
};

const createStaticPathCallback = (positions: Cartesian3[]) => (
    new CallbackProperty(() => positions, true)
);

const createReversedPathCallback = (source: CallbackProperty | null | undefined) => {
    if (!source) return null;
    return new CallbackProperty((time?: JulianDate) => {
        if (!time) return [];
        const value = source.getValue(time);
        return Array.isArray(value) ? [...value].reverse() : [];
    }, false);
};

const TransmissionLinks: React.FC<TransmissionLinksProps> = ({
    satellites,
    selectedPosition,
    pointB = null,
    leoSiteToSiteResult = null,
    linkMode,
    activeMeshTab = 'forward',
    selectedAircraft,
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    selectedSNP,
    selectedGateway,
    dedicatedSNPForSelectedLEO,
    satelliteScope,
    inspectedSNP,
    snpConnectedSatellites = [],
    leoServiceViewModel = null,
    resolvedAutoGeoGateway = null,
    resolvedSelectedGeoGateway = null,
    showFlowAnimation = true,
    cameraMetricsRef,
    commercialMode = false,
    commercialFocusedSegment = 'summary',
    commercialRouteAvailable = true,
    commercialDisplayTechnology = null,
    commercialLeoRouteAvailable,
    commercialGeoRouteAvailable,
    narrativeLayerActive = false,
}) => {
    const { viewer } = useCesium();

    // requestRenderMode wiring, step 2b.3.
    // BEHAVIOUR-NEUTRAL: requestRender() is a no-op while scene.requestRenderMode
    // is false, which is the current configuration.
    //
    // Reclassified from Group C to Group B. The 27 CallbackProperty sites here are
    // time-parameterised — they call `propagateSatellite(sat, time)` — but they
    // FOLLOW satellite motion rather than animating on their own: with no new
    // frame the clock does not advance and the endpoints simply hold position,
    // consistent with the satellites they connect. App already requests a frame
    // on each ~1 Hz propagation republish; this covers the layer's own inputs.
    useEffect(() => {
        requestGlobeRender(viewer);
    }, [
        viewer, satellites, selectedPosition, pointB, leoSiteToSiteResult,
        linkMode, activeMeshTab, selectedSatellite, autoSelectedLEOSatellite,
        autoSelectedGEOSatellite, selectedSNP, selectedGateway, satelliteScope,
    ]);

    const { coveragePolicy, weatherCondition, beamHealthFactors, hsBeamsSet } = useSimulation();
    const { focus: engineeringFocus, truths: engineeringTruths } = useEngineeringFocus();
    const engineeringDirection = activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B';
    const engineeringVisualState = React.useCallback((
        leg: EngineeringRouteLeg,
        technology: 'GEO' | 'LEO',
    ) => commercialMode ? undefined : getEngineeringLegVisualState({
        truth: engineeringTruths[technology],
        leg,
        focus: engineeringFocus,
        direction: engineeringDirection,
    }), [commercialMode, engineeringDirection, engineeringFocus, engineeringTruths]);
    const segmentAnnotation = React.useCallback((
        leg: EngineeringRouteLeg,
        technology: 'GEO' | 'LEO',
    ) => commercialMode ? null : getEngineeringLegAnnotation(
        engineeringTruths[technology],
        leg,
        engineeringFocus,
        engineeringDirection,
    ), [commercialMode, engineeringDirection, engineeringFocus, engineeringTruths]);

    // Live refs let stable callbacks read the latest selected satellites while still
    // propagating LEO links against Cesium time so they stay visually aligned with beams.
    const autoSelectedLEORef = useRef(autoSelectedLEOSatellite);
    autoSelectedLEORef.current = autoSelectedLEOSatellite;
    const autoSelectedGEORef = useRef(autoSelectedGEOSatellite);
    autoSelectedGEORef.current = autoSelectedGEOSatellite;
    const selectedSatelliteRef = useRef(selectedSatellite);
    selectedSatelliteRef.current = selectedSatellite;
    // PERF-2: leoS2SLinks reads this via ref instead of depending on the
    // `satellites` prop directly — it only needs a satrec to re-propagate
    // live against Cesium time inside each CallbackProperty (called every
    // frame), not a tick-fresh array reference, so there is no reason for
    // that memo to recompute (rebuilding 7 CallbackProperty closures and
    // reassigning them as Entity props) on every ~1s satellite-position tick.
    const satellitesRef = useRef(satellites);
    satellitesRef.current = satellites;
    const simulationState = useMemo(() => buildSimulationStateSnapshot({
        coveragePolicy,
        weatherCondition,
        beamHealthFactors,
        hsBeams: hsBeamsSet,
    }), [coveragePolicy, weatherCondition, beamHealthFactors, hsBeamsSet]);
    const hasUserSelection = !!(selectedPosition || selectedAircraft);
    const leoPathVisualState = leoServiceViewModel?.renderingHints.pathVisualState ?? 'normal';
    const leoLinkMaterial = useMemo(() => {
        if (leoPathVisualState === 'blocked') {
            return blockedDiagnosticMaterial;
        }
        if (leoPathVisualState === 'degraded') {
            return degradedMaterial;
        }
        return leoAllowedMaterial;
    }, [leoPathVisualState]);
    const leoLinkWidth = leoPathVisualState === 'blocked' ? 3.2 : 2.5;
    // When a display technology is set, secondary-technology links get narrower width
    // so the recommended technology's route reads as visually dominant.
    const commercialWidth = (segment: CommercialRouteSegmentType, baseWidth: number, tech?: 'LEO' | 'GEO') => {
        if (!commercialMode) return baseWidth;
        // CommercialRouteLayer is the primary visual — reduce legacy links to 30%
        // so they recede into the background without disappearing entirely.
        if (narrativeLayerActive) return Math.max(baseWidth * 0.3, 0.8);
        const isSecondary = !!commercialDisplayTechnology && !!tech && tech !== commercialDisplayTechnology;
        const effectiveBase = isSecondary ? Math.max(baseWidth * 0.55, 1.5) : baseWidth;
        if (commercialFocusedSegment === 'summary') return effectiveBase + (isSecondary ? 0.4 : 1.2);
        return commercialFocusedSegment === segment ? effectiveBase + (isSecondary ? 1.0 : 3) : Math.max(effectiveBase - 0.4, 1.5);
    };
    // S2S backbone (always LEO) — reduce boost when LEO is the secondary display technology.
    const s2sIsSecondary = commercialMode && !!commercialDisplayTechnology && commercialDisplayTechnology === 'GEO';
    const geoIsSecondary = commercialMode && !!commercialDisplayTechnology && commercialDisplayTechnology === 'LEO';
    const commercialGeoUserMaterial = geoIsSecondary
        ? (linkMode === 'STAR_RETURN' ? geoUplinkSecondaryMaterial : geoUserSecondaryMaterial)
        : (linkMode === 'STAR_RETURN' ? geoUplinkMaterial : geoUserMaterial);
    const commercialGeoFeederMaterial = geoIsSecondary ? geoFeederSecondaryMaterial : geoFeederMaterial;
    const commercialGeoBackhaulMaterial = geoIsSecondary ? geoBackhaulSecondaryMaterial : geoBackhaulMaterial;
    const commercialMeshTransmitMaterial = geoIsSecondary ? meshTransmitSecondaryMaterial : meshTransmitMaterial;
    const commercialMeshReceiveMaterial = geoIsSecondary ? meshReceiveSecondaryMaterial : meshReceiveMaterial;
    const commercialLeoUserMaterial = s2sIsSecondary ? s2sUserLinkSecondaryMaterial : leoLinkMaterial;
    const commercialLeoFeederMaterial = s2sIsSecondary ? s2sFeederLinkSecondaryMaterial : leoLinkMaterial;
    const commercialS2SUserMaterial = s2sIsSecondary ? s2sUserLinkSecondaryMaterial : s2sUserLinkMaterial;
    const commercialS2SFeederMaterial = s2sIsSecondary ? s2sFeederLinkSecondaryMaterial : s2sFeederLinkMaterial;
    const commercialBackboneBoost = commercialMode
        ? commercialFocusedSegment === 'summary'
            ? s2sIsSecondary ? 0.4 : 1.2
            : commercialFocusedSegment === 'backhaul'
                ? s2sIsSecondary ? 1.0 : 3
                : 0
        : 0;
    const entityScopeId = React.useId();
    const routeEntityId = React.useCallback((segment: CommercialRouteSegmentType, technology: 'leo' | 'geo', suffix: string) => (
        buildEntityId(commercialMode ? 'commercial' : 'engineering', entityScopeId, 'route', segment, technology, suffix)
    ), [commercialMode, entityScopeId]);
    const routeEntityIds = useMemo(() => ({
        leoUplink: routeEntityId('access', 'leo', 'uplink'),
        leoBackhaul: routeEntityId('backhaul', 'leo', 'backhaul'),
        geoUser: routeEntityId('access', 'geo', 'user'),
        geoFeeder: routeEntityId('backhaul', 'geo', 'feeder'),
        geoBackhaul: routeEntityId('backhaul', 'geo', 'backhaul'),
        geoMeshASat: routeEntityId('access', 'geo', 'mesh-a-sat'),
        geoMeshSatB: routeEntityId('destination', 'geo', 'mesh-sat-b'),
        geoMeshBSat: routeEntityId('destination', 'geo', 'mesh-b-sat'),
        geoMeshSatA: routeEntityId('access', 'geo', 'mesh-sat-a'),
        leoS2SASat: routeEntityId('access', 'leo', 's2s-a-sat'),
        leoS2SSatASnpA: routeEntityId('backhaul', 'leo', 's2s-sata-snpa'),
        leoS2SSnpAPop: routeEntityId('backhaul', 'leo', 's2s-snpa-pop'),
        leoS2SPopSnpB: routeEntityId('backhaul', 'leo', 's2s-pop-snpb'),
        leoS2SBackboneSame: routeEntityId('backhaul', 'leo', 's2s-backbone-same'),
        // Distinct ids for the "service unavailable" backbone-only fallback (leoS2SBackbone
        // below): it renders in a JSX branch mutually exclusive with the full route
        // (leoS2SLinks), but the two can still transiently overlap during the mount/unmount
        // that Resium performs when switching branches, since Entity add/remove is async
        // (queueMicrotask-deferred). Reusing the same id let a new Entity's add() race ahead
        // of the old one's remove(), throwing a Cesium "already exists" DeveloperError.
        leoS2SSnpAPopFallback: routeEntityId('backhaul', 'leo', 's2s-snpa-pop-fallback'),
        leoS2SPopSnpBFallback: routeEntityId('backhaul', 'leo', 's2s-pop-snpb-fallback'),
        leoS2SBackboneSameFallback: routeEntityId('backhaul', 'leo', 's2s-backbone-same-fallback'),
        leoS2SSnpBSatB: routeEntityId('backhaul', 'leo', 's2s-snpb-satb'),
        leoS2SSatBB: routeEntityId('destination', 'leo', 's2s-satb-b'),
        leoS2SSnpAMarker: buildEntityId(commercialMode ? 'commercial' : 'engineering', entityScopeId, 'route-node', 'leo', 's2s', 'snp-a'),
        leoS2SSnpBMarker: buildEntityId(commercialMode ? 'commercial' : 'engineering', entityScopeId, 'route-node', 'leo', 's2s', 'snp-b'),
        leoS2SPopMarker: buildEntityId(commercialMode ? 'commercial' : 'engineering', entityScopeId, 'route-node', 'leo', 's2s', 'pop'),
        leoS2SSnpAMarkerFallback: buildEntityId(commercialMode ? 'commercial' : 'engineering', entityScopeId, 'route-node', 'leo', 's2s', 'snp-a-fallback'),
        leoS2SSnpBMarkerFallback: buildEntityId(commercialMode ? 'commercial' : 'engineering', entityScopeId, 'route-node', 'leo', 's2s', 'snp-b-fallback'),
        leoS2SPopMarkerFallback: buildEntityId(commercialMode ? 'commercial' : 'engineering', entityScopeId, 'route-node', 'leo', 's2s', 'pop-fallback'),
    }), [commercialMode, entityScopeId, routeEntityId]);
    // Per-technology route gates — each technology's links are only shown when that
    // technology has an available route, regardless of which is "active". This prevents
    // hiding the GEO route when LEO is active-but-unavailable, and vice-versa.
    const showLeoCommercialRoute = !commercialMode || (commercialLeoRouteAvailable ?? commercialRouteAvailable);
    const showGeoCommercialRoute = !commercialMode || (commercialGeoRouteAvailable ?? commercialRouteAvailable);
    const showCommercialInspectionLinks = !commercialMode;
    const commercialBackboneFocused = commercialMode && commercialFocusedSegment === 'backhaul';

    const resolveCurrentUser = useMemo(() => {
        return (time: JulianDate) => {
            const userPosition = selectedAircraft
                ? calculateDeadReckoning(selectedAircraft, time)
                : getRouteSurfacePosition(selectedPosition!.lat, selectedPosition!.lng, selectedPosition!.altitude || 0);

            const userLocation = selectedAircraft
                ? (() => {
                    const carto = Cartographic.fromCartesian(userPosition);
                    return {
                        lat: CesiumMath.toDegrees(carto.latitude),
                        lng: CesiumMath.toDegrees(carto.longitude),
                        altitude: carto.height / 1000
                    };
                })()
                : {
                    lat: selectedPosition!.lat,
                    lng: selectedPosition!.lng,
                    altitude: selectedPosition!.altitude || 0
                };

            return { userPosition, userLocation };
        };
    }, [selectedAircraft, selectedPosition]);

    // LEO Uplink positions callback
    const leoUplinkCallback = useMemo(() => {
        if (!autoSelectedLEOSatellite || !hasUserSelection) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const { userPosition: startPos, userLocation } = resolveCurrentUser(time);

            // Check RF connectivity before rendering link
            if (!hasRFConnectivity(userLocation, autoSelectedLEOSatellite, time, simulationState)) {
                return []; // No link if no RF connectivity
            }

            // Point B: LEO satellite propagated at the current Cesium time so the
            // link endpoint stays synchronized with the moving beams.
            const s = autoSelectedLEORef.current!;
            const endPos = propagateSatellite(s, time);

            return [startPos, endPos];
        }, false);
    }, [autoSelectedLEOSatellite, hasUserSelection, resolveCurrentUser, simulationState]);

    // LEO Backhaul positions callback (to SNP)
    const leoBackhaulCallback = useMemo(() => {
        if (!autoSelectedLEOSatellite || !selectedSNP?.lat || !selectedSNP?.lng) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const s = autoSelectedLEORef.current!;
            const satPos = propagateSatellite(s, time);
            const snpPos = getRouteSurfacePosition(selectedSNP.lat, selectedSNP.lng);

            return [satPos, snpPos];
        }, false);
    }, [autoSelectedLEOSatellite, selectedSNP]);

    // The two LEO route segments are the ones whose positions callback goes
    // null and comes back mid-session — `autoSelectedLEOSatellite` is briefly
    // unresolved on every serving-satellite handover, and `selectedSNP` follows
    // it. Their entities therefore stay mounted against these stable properties
    // and are toggled with `show`, instead of being unmounted and re-added
    // under the same Cesium id while the previous removal is still pending.
    const leoUplinkPositions = useStableRoutePositions(leoUplinkCallback);
    const leoBackhaulPositions = useStableRoutePositions(leoBackhaulCallback);

    // GEO User -> Satellite link
    const geoUserLinkCallback = useMemo(() => {
        if (!autoSelectedGEOSatellite || !hasUserSelection) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const { userPosition } = resolveCurrentUser(time);
            const g = autoSelectedGEORef.current!;
            const satPos = getPosition(g.position.lat, g.position.lng, g.position.alt);

            return [userPosition, satPos];
        }, false);
    }, [autoSelectedGEOSatellite, hasUserSelection, resolveCurrentUser]);

    // The feeder/backhaul entities depict the traffic path, so they draw only when
    // App resolved a traffic gateway (beam-aware, failover-aware). No local
    // re-resolution fallback: resolveGatewayForSatellite returns the SCC control
    // site, which is not in the traffic path and would contradict the panels.
    const bestGeoGateway = autoSelectedGEOSatellite ? resolvedAutoGeoGateway : null;

    // GEO Satellite -> Gateway feeder link
    const geoFeederLinkCallback = useMemo(() => {
        if (!autoSelectedGEOSatellite || !hasUserSelection || !bestGeoGateway) return null;

        // Pre-compute the static gateway position once (avoids allocation every frame)
        const gwLat = bestGeoGateway.latitude;
        const gwLng = bestGeoGateway.longitude;
        const gatewayPos = getRouteSurfacePosition(gwLat, gwLng);

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];
            const g = autoSelectedGEORef.current!;
            const satPos = getPosition(g.position.lat, g.position.lng, g.position.alt);
            return [satPos, gatewayPos];
        }, false);
    }, [autoSelectedGEOSatellite, hasUserSelection, bestGeoGateway]);

    // GEO Gateway -> Internet backhaul (conceptual terrestrial segment)
    const geoBackhaulCallback = useMemo(() => {
        if (!autoSelectedGEOSatellite || !hasUserSelection || !bestGeoGateway) return null;

        // Both positions are fully static — no per-frame computation needed
        const gwLat = bestGeoGateway.latitude;
        const gwLng = bestGeoGateway.longitude;
        const gatewayPos = getRouteSurfacePosition(gwLat, gwLng);
        const internetPos = getRouteSurfacePosition(gwLat + 0.3, gwLng + 0.3);
        const staticPositions = [gatewayPos, internetPos];

        return new CallbackProperty((_time?: JulianDate) => staticPositions, false);
    }, [autoSelectedGEOSatellite, hasUserSelection, bestGeoGateway]);

    const dedicatedGeoGateway = selectedSatellite?.type === 'EUTELSAT'
        ? resolvedSelectedGeoGateway
        : null;

    // Dedicated SNP link for manually selected LEO satellite
    const dedicatedSnpCallback = useMemo(() => {
        if (!selectedSatellite || selectedSatellite.type !== 'ONEWEB' || !dedicatedSNPForSelectedLEO || selectedSatellite.opsStatus !== 'operational') return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const s = selectedSatelliteRef.current!;
            const satPos = propagateSatellite(s, time);
            const snpPos = getRouteSurfacePosition(dedicatedSNPForSelectedLEO.lat, dedicatedSNPForSelectedLEO.lng);

            return [satPos, snpPos];
        }, false);
    }, [selectedSatellite, dedicatedSNPForSelectedLEO]);

    const dedicatedGeoFeederCallback = useMemo(() => {
        if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT' || !dedicatedGeoGateway || selectedSatellite.opsStatus !== 'operational') return null;

        const gwLat = dedicatedGeoGateway.latitude;
        const gwLng = dedicatedGeoGateway.longitude;
        const gatewayPos = getRouteSurfacePosition(gwLat, gwLng);

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const s = selectedSatelliteRef.current!;
            const satPos = getPosition(s.position.lat, s.position.lng, s.position.alt);
            return [satPos, gatewayPos];
        }, false);
    }, [selectedSatellite, dedicatedGeoGateway]);

    // SNP inspection links (one per connected satellite)
    const snpInspectionLinks = useMemo(() => {
        if (!inspectedSNP) return null;
        const snpPos = getRouteSurfacePosition(inspectedSNP.lat, inspectedSNP.lng);

        return snpConnectedSatellites.filter(({ satellite }) => satellite.opsStatus === 'operational').map(({ satellite }) => {
            const callback = new CallbackProperty((time?: JulianDate) => {
                const satPos = time && satellite.type === 'ONEWEB'
                    ? propagateSatellite(satellite, time)
                    : getPosition(satellite.position.lat, satellite.position.lng, satellite.position.alt);
                return [satPos, snpPos];
            }, false);
            return { id: satellite.id, callback };
        });
    }, [inspectedSNP, snpConnectedSatellites]);

    const selectedGatewayLinks = useMemo(() => {
        if (!selectedGateway || satelliteScope === 'LEO') return null;

        const gatewayPos = getRouteSurfacePosition(selectedGateway.lat, selectedGateway.lng);
        const monitoredSatellites = getMonitoredGeoSatellitesForGateway(selectedGateway, satellites, GEO_GATEWAYS);

        return monitoredSatellites.map((satellite) => ({
                id: satellite.id,
                name: satellite.name,
                callback: new CallbackProperty((_time?: JulianDate) => {
                    return [gatewayPos, getPosition(satellite.position.lat, satellite.position.lng, satellite.position.alt)];
                }, false),
            }));
    }, [selectedGateway, satelliteScope, satellites]);

    const dedicatedSnpEntityId = buildEntityId(
        'engineering',
        'inspection',
        'leo',
        'dedicated-snp',
        selectedSatellite?.id,
        dedicatedSNPForSelectedLEO?.name,
    );
    const dedicatedGeoFeederEntityId = buildEntityId(
        'engineering',
        'inspection',
        'geo',
        'dedicated-gateway',
        selectedSatellite?.id,
        dedicatedGeoGateway?.gatewayId,
    );

    // In MESH / P2P the gateway is not part of the RF path — hide all gateway links
    // as soon as the mode is active, regardless of whether Point B has been placed.
    const isMeshOrP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
    const isDualPointActive = isMeshOrP2P && !!pointB;

    const meshSatToBCallback = useMemo(() => {
        if (!isDualPointActive || !autoSelectedGEOSatellite || !pointB) return null;

        const pointBPos = getRouteSurfacePosition(pointB.lat, pointB.lng);

        return new CallbackProperty((_time?: JulianDate) => {
            const g = autoSelectedGEORef.current;
            if (!g) return [];
            const satPos = getPosition(g.position.lat, g.position.lng, g.position.alt);
            return [satPos, pointBPos];
        }, false);
    }, [isDualPointActive, autoSelectedGEOSatellite, pointB]);

    // B→A direction: B transmits (B→Sat) then satellite transmits to A (Sat→A).
    // Same physical segments as A→B but with reversed position arrays so arrow
    // heads point in the correct RF flow direction.
    const meshBtoSatCallback = useMemo(() => {
        if (!isDualPointActive || !autoSelectedGEOSatellite || !pointB) return null;
        const pointBPos = getRouteSurfacePosition(pointB.lat, pointB.lng);
        return new CallbackProperty((_time?: JulianDate) => {
            const g = autoSelectedGEORef.current;
            if (!g) return [];
            const satPos = getPosition(g.position.lat, g.position.lng, g.position.alt);
            return [pointBPos, satPos]; // reversed: arrow at Sat end → B transmits
        }, false);
    }, [isDualPointActive, autoSelectedGEOSatellite, pointB]);

    const meshSatToACallback = useMemo(() => {
        if (!isDualPointActive || !autoSelectedGEOSatellite || !hasUserSelection) return null;
        return new CallbackProperty((time?: JulianDate) => {
            const g = autoSelectedGEORef.current;
            if (!g || !time) return [];
            const satPos = getPosition(g.position.lat, g.position.lng, g.position.alt);
            const { userPosition } = resolveCurrentUser(time);
            return [satPos, userPosition];
        }, false);
    }, [isDualPointActive, autoSelectedGEOSatellite, hasUserSelection, resolveCurrentUser]);

    // ── LEO site-to-site static link segments ─────────────────────────────────
    // All positions are static or satellite-propagated at render time.
    // Rebuilt whenever the s2s result changes (satellite IDs / SNP / PoP change).
    const leoS2SLinks = useMemo(() => {
        const r = leoSiteToSiteResult;
        if (!r) return null;
        if (!r.serviceAvailable) return null;

        const { endpointA, endpointB, servingSatelliteA, servingSatelliteB, selectedSnpA, selectedSnpB, logicalPop } = r;
        if (!servingSatelliteA || !servingSatelliteB) return null;

        const posA = getRouteSurfacePosition(endpointA.lat, endpointA.lng);
        const posB = getRouteSurfacePosition(endpointB.lat, endpointB.lng);
        const snpAPos = selectedSnpA ? getRouteSurfacePosition(selectedSnpA.lat, selectedSnpA.lng) : null;
        const snpBPos = selectedSnpB ? getRouteSurfacePosition(selectedSnpB.lat, selectedSnpB.lng) : null;
        const popPos = logicalPop ? getRouteSurfacePosition(logicalPop.lat, logicalPop.lng) : null;

        // Satellite positions: propagated against current Cesium time so they stay
        // visually aligned with the moving constellation.
        const satAId = servingSatelliteA.id;
        const satBId = servingSatelliteB.id;

        const satACallback = new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];
            const sat = satellitesRef.current.find(s => s.id === satAId);
            if (!sat) return [];
            const satPos = propagateSatellite(sat, time);
            return [posA, satPos];
        }, false);

        const satAToSnpACallback = snpAPos ? new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];
            const sat = satellitesRef.current.find(s => s.id === satAId);
            if (!sat) return [];
            const satPos = propagateSatellite(sat, time);
            return [satPos, snpAPos];
        }, false) : null;

        const satBCallback = new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];
            const sat = satellitesRef.current.find(s => s.id === satBId);
            if (!sat) return [];
            const satPos = propagateSatellite(sat, time);
            return [satPos, posB];
        }, false);

        const satBToSnpBCallback = snpBPos ? new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];
            const sat = satellitesRef.current.find(s => s.id === satBId);
            if (!sat) return [];
            const satPos = propagateSatellite(sat, time);
            return [snpBPos, satPos];
        }, false) : null;

        const sameSNP = !!(selectedSnpA && selectedSnpB && selectedSnpA.name === selectedSnpB.name);
        const snpAToPopCallback = snpAPos && popPos ? createStaticPathCallback([snpAPos, popPos]) : null;
        const popToSnpBCallback = snpBPos && popPos ? createStaticPathCallback([popPos, snpBPos]) : null;
        const sameSnpCallback = sameSNP && snpAPos && snpBPos ? createStaticPathCallback([snpAPos, snpBPos]) : null;

        return {
            satACallback, satAToSnpACallback, satBCallback, satBToSnpBCallback,
            snpAToPopCallback, popToSnpBCallback, sameSnpCallback,
            snpAPos, snpBPos, popPos, sameSNP,
            snpAName: selectedSnpA?.name ?? null, snpBName: selectedSnpB?.name ?? null,
            popName: logicalPop?.name ?? 'Core PoP',
        };
    }, [leoSiteToSiteResult]);

    // Backbone topology visible even when full S2S route is unavailable (e.g. regulatory
    // pending, no satellite coverage). Computed only when leoS2SLinks would be null.
    const leoS2SBackbone = useMemo(() => {
        const r = leoSiteToSiteResult;
        if (!r) return null;
        // leoS2SLinks already handles the full render when route is available
        if (r.serviceAvailable && r.servingSatelliteA && r.servingSatelliteB) return null;

        const { selectedSnpA, selectedSnpB, logicalPop } = r;
        if (!selectedSnpA || !selectedSnpB) return null;

        const snpAPos = getRouteSurfacePosition(selectedSnpA.lat, selectedSnpA.lng);
        const snpBPos = getRouteSurfacePosition(selectedSnpB.lat, selectedSnpB.lng);
        const popPos = logicalPop ? getRouteSurfacePosition(logicalPop.lat, logicalPop.lng) : null;
        const sameSNP = selectedSnpA.name === selectedSnpB.name;
        const snpAToPopCallback = snpAPos && popPos ? createStaticPathCallback([snpAPos, popPos]) : null;
        const popToSnpBCallback = snpBPos && popPos ? createStaticPathCallback([popPos, snpBPos]) : null;
        const sameSnpCallback = sameSNP ? createStaticPathCallback([snpAPos, snpBPos]) : null;

        return {
            snpAPos, snpBPos, popPos, sameSNP,
            snpAToPopCallback, popToSnpBCallback, sameSnpCallback,
            snpAName: selectedSnpA.name,
            snpBName: selectedSnpB.name,
            popName: logicalPop?.name ?? 'Core PoP',
        };
    }, [leoSiteToSiteResult]);

    const isSiteToSiteActive = !!(leoS2SLinks);

    const reverseGeoUserLinkCallback = useMemo(() => createReversedPathCallback(geoUserLinkCallback), [geoUserLinkCallback]);
    const reverseGeoFeederLinkCallback = useMemo(() => createReversedPathCallback(geoFeederLinkCallback), [geoFeederLinkCallback]);
    const reverseLeoUplinkCallback = useMemo(() => createReversedPathCallback(leoUplinkCallback), [leoUplinkCallback]);
    const reverseLeoBackhaulCallback = useMemo(() => createReversedPathCallback(leoBackhaulCallback), [leoBackhaulCallback]);
    const reverseLeoS2SSatACallback = useMemo(() => createReversedPathCallback(leoS2SLinks?.satACallback), [leoS2SLinks?.satACallback]);
    const reverseLeoS2SSatAToSnpACallback = useMemo(() => createReversedPathCallback(leoS2SLinks?.satAToSnpACallback), [leoS2SLinks?.satAToSnpACallback]);
    const reverseLeoS2SSatBCallback = useMemo(() => createReversedPathCallback(leoS2SLinks?.satBCallback), [leoS2SLinks?.satBCallback]);
    const reverseLeoS2SSatBToSnpBCallback = useMemo(() => createReversedPathCallback(leoS2SLinks?.satBToSnpBCallback), [leoS2SLinks?.satBToSnpBCallback]);
    const reverseSnpAToPopCallback = useMemo(() => createReversedPathCallback(leoS2SLinks?.snpAToPopCallback), [leoS2SLinks?.snpAToPopCallback]);
    const reversePopToSnpBCallback = useMemo(() => createReversedPathCallback(leoS2SLinks?.popToSnpBCallback), [leoS2SLinks?.popToSnpBCallback]);
    const reverseSameSnpCallback = useMemo(() => createReversedPathCallback(leoS2SLinks?.sameSnpCallback), [leoS2SLinks?.sameSnpCallback]);

    const flowSegments = useMemo<PathSegment[]>(() => {
        const segments: PathSegment[] = [];
        const add = (
            id: string,
            type: PathSegment['type'],
            positions: CallbackProperty | null | undefined,
            color: Color,
            durationSeconds?: number,
            phaseOffset?: number,
        ) => {
            if (!positions) return;
            segments.push({ id, type, positions, color, durationSeconds, phaseOffset });
        };

        if (satelliteScope !== 'LEO') {
            if (isMeshOrP2P) {
                if (activeMeshTab === 'reverse') {
                    add('geo-mesh-b-sat', 'GEO_RF', meshBtoSatCallback, flowMeshTransmitColor, 2.2);
                    add('geo-mesh-sat-a', 'GEO_RF', meshSatToACallback, flowMeshReceiveColor, 2.2);
                } else {
                    add('geo-mesh-a-sat', 'GEO_RF', geoUserLinkCallback, flowMeshTransmitColor, 2.2);
                    add('geo-mesh-sat-b', 'GEO_RF', meshSatToBCallback, flowMeshReceiveColor, 2.2);
                }
            } else if (linkMode === 'STAR_RETURN') {
                add('geo-star-return-user-sat', 'GEO_RF', geoUserLinkCallback, flowGeoReturnColor, 2.15);
                add('geo-star-return-sat-gw', 'GEO_RF', geoFeederLinkCallback, flowGeoReturnColor, 2.15);
            } else {
                add('geo-star-forward-gw-sat', 'GEO_RF', reverseGeoFeederLinkCallback, flowGeoForwardColor, 2.15);
                add('geo-star-forward-sat-user', 'GEO_RF', reverseGeoUserLinkCallback, flowGeoForwardColor, 2.15);
            }
        }

        if (leoS2SLinks) {
            if (activeMeshTab === 'reverse') {
                add('leo-s2s-b-sat', 'USER_LINK', reverseLeoS2SSatBCallback, flowLeoUserColor, 1.85);
                add('leo-s2s-satb-snpb', 'FEEDER_LINK', reverseLeoS2SSatBToSnpBCallback, flowLeoFeederColor, 1.75);
                if (leoS2SLinks.sameSNP) {
                    add('leo-s2s-backbone-same-reverse', 'BACKBONE', reverseSameSnpCallback, flowBackboneColor, 2.4);
                } else {
                    add('leo-s2s-snpb-pop', 'BACKBONE', reversePopToSnpBCallback, flowBackboneColor, 2.4);
                    add('leo-s2s-pop-snpa', 'BACKBONE', reverseSnpAToPopCallback, flowBackboneColor, 2.4);
                }
                add('leo-s2s-snpa-sata', 'FEEDER_LINK', reverseLeoS2SSatAToSnpACallback, flowLeoFeederColor, 1.75);
                add('leo-s2s-sata-a', 'USER_LINK', reverseLeoS2SSatACallback, flowLeoUserColor, 1.85);
            } else {
                add('leo-s2s-a-sat', 'USER_LINK', leoS2SLinks.satACallback, flowLeoUserColor, 1.85);
                add('leo-s2s-sata-snpa', 'FEEDER_LINK', leoS2SLinks.satAToSnpACallback, flowLeoFeederColor, 1.75);
                if (leoS2SLinks.sameSNP) {
                    add('leo-s2s-backbone-same', 'BACKBONE', leoS2SLinks.sameSnpCallback, flowBackboneColor, 2.4);
                } else {
                    add('leo-s2s-snpa-pop', 'BACKBONE', leoS2SLinks.snpAToPopCallback, flowBackboneColor, 2.4);
                    add('leo-s2s-pop-snpb', 'BACKBONE', leoS2SLinks.popToSnpBCallback, flowBackboneColor, 2.4);
                }
                add('leo-s2s-snpb-satb', 'FEEDER_LINK', leoS2SLinks.satBToSnpBCallback, flowLeoFeederColor, 1.75);
                add('leo-s2s-satb-b', 'USER_LINK', leoS2SLinks.satBCallback, flowLeoUserColor, 1.85);
            }
        } else if (satelliteScope !== 'GEO') {
            // Single-site LEO is a bidirectional access service:
            // uplink flows Site A → satellite → SNP, while downlink flows SNP → satellite → Site A.
            add('leo-single-user-sat', 'USER_LINK', leoUplinkCallback, flowLeoUserColor, 1.85);
            add('leo-single-sat-snp', 'FEEDER_LINK', leoBackhaulCallback, flowLeoFeederColor, 1.75);
            add('leo-single-snp-sat', 'FEEDER_LINK', reverseLeoBackhaulCallback, flowLeoFeederColor, 1.75, 0.38);
            add('leo-single-sat-user', 'USER_LINK', reverseLeoUplinkCallback, flowLeoUserColor, 1.85, 0.38);
        }

        return segments;
    }, [
        activeMeshTab,
        geoFeederLinkCallback,
        geoUserLinkCallback,
        isMeshOrP2P,
        leoBackhaulCallback,
        leoS2SLinks,
        leoUplinkCallback,
        linkMode,
        meshBtoSatCallback,
        meshSatToACallback,
        meshSatToBCallback,
        reverseGeoFeederLinkCallback,
        reverseGeoUserLinkCallback,
        reverseLeoBackhaulCallback,
        reverseLeoUplinkCallback,
        reverseLeoS2SSatACallback,
        reverseLeoS2SSatAToSnpACallback,
        reverseLeoS2SSatBCallback,
        reverseLeoS2SSatBToSnpBCallback,
        reversePopToSnpBCallback,
        reverseSameSnpCallback,
        reverseSnpAToPopCallback,
        satelliteScope,
    ]);

    if (!hasUserSelection && !dedicatedSnpCallback && !dedicatedGeoFeederCallback && !inspectedSNP && !selectedGatewayLinks?.length && !isSiteToSiteActive) {
        return null;
    }

    // Same predicates as the JSX branches these replaced, so what is drawn is
    // unchanged — only whether the entities exist while it is not drawn.
    const showLeoAccessRoute = Boolean(
        showLeoCommercialRoute && leoUplinkCallback && satelliteScope !== 'GEO' && !isSiteToSiteActive
    );
    const showLeoBackhaulRoute = Boolean(
        showLeoCommercialRoute && leoBackhaulCallback && satelliteScope !== 'GEO' && selectedSNP && !isSiteToSiteActive
    );

    return (
        <>
            {/* LEO Uplink/Downlink - User to Satellite.
                Mounted for the lifetime of this component and shown/hidden
                natively — see useStableRoutePositions for why presence must not
                track the route's availability. */}
            <HighlightedRouteSegment
                name="LEO Uplink/Downlink"
                positions={leoUplinkPositions}
                width={commercialWidth('access', leoLinkWidth, 'LEO')}
                material={commercialLeoUserMaterial}
                entityIdBase={routeEntityIds.leoUplink}
                subdued={s2sIsSecondary}
                visualState={engineeringVisualState('leo-access', 'LEO')}
                show={showLeoAccessRoute}
            />
            {showLeoAccessRoute && (
                <EngineeringSegmentAnnotation
                    entityId={`${routeEntityIds.leoUplink}-annotation`}
                    text={segmentAnnotation('leo-access', 'LEO')}
                    positions={leoUplinkPositions}
                />
            )}

            {/* LEO Backhaul to SNP - Satellite to Gateway */}
            <HighlightedRouteSegment
                name="LEO Backhaul"
                positions={leoBackhaulPositions}
                width={commercialWidth('backhaul', leoLinkWidth, 'LEO')}
                material={commercialLeoFeederMaterial}
                entityIdBase={routeEntityIds.leoBackhaul}
                clampToGround={false}
                subdued={s2sIsSecondary}
                visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                show={showLeoBackhaulRoute}
            />
            {showLeoBackhaulRoute && (
                <EngineeringSegmentAnnotation
                    entityId={`${routeEntityIds.leoBackhaul}-annotation`}
                    text={segmentAnnotation('leo-backhaul', 'LEO')}
                    positions={leoBackhaulPositions}
                />
            )}

            {/* GEO User → Satellite (STAR modes only; MESH uses directional callbacks below) */}
            {showGeoCommercialRoute && geoUserLinkCallback && satelliteScope !== 'LEO' && !isMeshOrP2P && (
                <>
                    <Entity key={routeEntityIds.geoUser} id={routeEntityIds.geoUser} name="GEO User Link">
                        <PolylineGraphics
                            positions={geoUserLinkCallback}
                            width={widthForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialWidth('access', 2.5, 'GEO'))}
                            material={materialForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialGeoUserMaterial)}
                            depthFailMaterial={materialForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialGeoUserMaterial)}
                            arcType={ArcType.NONE}
                        />
                    </Entity>
                    <EngineeringSegmentAnnotation
                        entityId={`${routeEntityIds.geoUser}-annotation`}
                        text={segmentAnnotation('geo-access', 'GEO')}
                        positions={geoUserLinkCallback}
                    />
                </>
            )}

            {/* GEO Satellite -> Gateway — hidden in MESH/P2P (gateway not in the path) */}
            {showGeoCommercialRoute && geoFeederLinkCallback && satelliteScope !== 'LEO' && !isMeshOrP2P && (
                <>
                    <Entity key={routeEntityIds.geoFeeder} id={routeEntityIds.geoFeeder} name="GEO Feeder Link">
                        <PolylineGraphics
                            positions={geoFeederLinkCallback}
                            width={widthForEngineeringState(engineeringVisualState('geo-feeder', 'GEO'), commercialWidth('backhaul', 2.5, 'GEO'))}
                            material={materialForEngineeringState(engineeringVisualState('geo-feeder', 'GEO'), commercialGeoFeederMaterial)}
                            depthFailMaterial={materialForEngineeringState(engineeringVisualState('geo-feeder', 'GEO'), commercialGeoFeederMaterial)}
                            arcType={ArcType.NONE}
                        />
                    </Entity>
                    <EngineeringSegmentAnnotation
                        entityId={`${routeEntityIds.geoFeeder}-annotation`}
                        text={segmentAnnotation('geo-feeder', 'GEO')}
                        positions={geoFeederLinkCallback}
                    />
                </>
            )}

            {/* GEO Gateway -> Internet — hidden in MESH/P2P */}
            {showGeoCommercialRoute && geoBackhaulCallback && satelliteScope !== 'LEO' && !isMeshOrP2P && (
                <Entity key={routeEntityIds.geoBackhaul} id={routeEntityIds.geoBackhaul} name="GEO Backhaul Link">
                    <PolylineGraphics
                        positions={geoBackhaulCallback}
                        width={widthForEngineeringState(engineeringVisualState('geo-ground', 'GEO'), commercialWidth('backhaul', 2.5, 'GEO'))}
                        material={materialForEngineeringState(engineeringVisualState('geo-ground', 'GEO'), commercialGeoBackhaulMaterial)}
                        depthFailMaterial={materialForEngineeringState(engineeringVisualState('geo-ground', 'GEO'), commercialGeoBackhaulMaterial)}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* ── MESH/P2P directional links ──────────────────────────────────────────
                Orange glow = transmit leg (terminal that emits in the active direction).
                Cyan glow   = receive leg (terminal that receives in the active direction).
                Colours swap when switching the A→B / B→A direction tab.            */}
            {showGeoCommercialRoute && isMeshOrP2P && satelliteScope !== 'LEO' && activeMeshTab === 'forward' && (
                <>
                    {geoUserLinkCallback && (
                        <Entity key={routeEntityIds.geoMeshASat} id={routeEntityIds.geoMeshASat} name="A → Satellite (transmit)">
                            <PolylineGraphics positions={geoUserLinkCallback} width={widthForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialWidth('access', 5, 'GEO'))} material={materialForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialMeshTransmitMaterial)} depthFailMaterial={materialForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialMeshTransmitMaterial)} arcType={ArcType.NONE} />
                        </Entity>
                    )}
                    {meshSatToBCallback && (
                        <Entity key={routeEntityIds.geoMeshSatB} id={routeEntityIds.geoMeshSatB} name="Satellite → B (receive)">
                            <PolylineGraphics positions={meshSatToBCallback} width={widthForEngineeringState(engineeringVisualState('geo-site-b', 'GEO'), commercialWidth('destination', 5, 'GEO'))} material={materialForEngineeringState(engineeringVisualState('geo-site-b', 'GEO'), commercialMeshReceiveMaterial)} depthFailMaterial={materialForEngineeringState(engineeringVisualState('geo-site-b', 'GEO'), commercialMeshReceiveMaterial)} clampToGround={false} arcType={ArcType.NONE} />
                        </Entity>
                    )}
                    {geoUserLinkCallback && (
                        <EngineeringSegmentAnnotation
                            entityId={`${routeEntityIds.geoMeshASat}-annotation`}
                            text={segmentAnnotation('geo-access', 'GEO')}
                            positions={geoUserLinkCallback}
                        />
                    )}
                    {meshSatToBCallback && (
                        <EngineeringSegmentAnnotation
                            entityId={`${routeEntityIds.geoMeshSatB}-annotation`}
                            text={segmentAnnotation('geo-site-b', 'GEO')}
                            positions={meshSatToBCallback}
                        />
                    )}
                </>
            )}
            {showGeoCommercialRoute && isMeshOrP2P && satelliteScope !== 'LEO' && activeMeshTab === 'reverse' && (
                <>
                    {meshBtoSatCallback && (
                        <Entity key={routeEntityIds.geoMeshBSat} id={routeEntityIds.geoMeshBSat} name="B → Satellite (transmit)">
                            <PolylineGraphics positions={meshBtoSatCallback} width={widthForEngineeringState(engineeringVisualState('geo-site-b', 'GEO'), commercialWidth('destination', 5, 'GEO'))} material={materialForEngineeringState(engineeringVisualState('geo-site-b', 'GEO'), commercialMeshTransmitMaterial)} depthFailMaterial={materialForEngineeringState(engineeringVisualState('geo-site-b', 'GEO'), commercialMeshTransmitMaterial)} clampToGround={false} arcType={ArcType.NONE} />
                        </Entity>
                    )}
                    {meshSatToACallback && (
                        <Entity key={routeEntityIds.geoMeshSatA} id={routeEntityIds.geoMeshSatA} name="Satellite → A (receive)">
                            <PolylineGraphics positions={meshSatToACallback} width={widthForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialWidth('access', 5, 'GEO'))} material={materialForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialMeshReceiveMaterial)} depthFailMaterial={materialForEngineeringState(engineeringVisualState('geo-access', 'GEO'), commercialMeshReceiveMaterial)} arcType={ArcType.NONE} />
                        </Entity>
                    )}
                    {meshSatToACallback && (
                        <EngineeringSegmentAnnotation
                            entityId={`${routeEntityIds.geoMeshSatA}-annotation`}
                            text={segmentAnnotation('geo-access', 'GEO')}
                            positions={meshSatToACallback}
                        />
                    )}
                    {meshBtoSatCallback && (
                        <EngineeringSegmentAnnotation
                            entityId={`${routeEntityIds.geoMeshBSat}-annotation`}
                            text={segmentAnnotation('geo-site-b', 'GEO')}
                            positions={meshBtoSatCallback}
                        />
                    )}
                </>
            )}

            {/* Dedicated SNP Link for manually selected satellite */}
            {showCommercialInspectionLinks && dedicatedSnpCallback && (
                <HighlightedRouteSegment
                    name="LEO Satellite → Dedicated SNP"
                    positions={dedicatedSnpCallback}
                    width={commercialWidth('backhaul', leoPathVisualState === 'blocked' ? 2.4 : 2)}
                    material={leoLinkMaterial}
                    entityIdBase={dedicatedSnpEntityId}
                    clampToGround={false}
                />
            )}

            {/* Dedicated Gateway Link for manually selected GEO satellite */}
            {showCommercialInspectionLinks && dedicatedGeoFeederCallback && satelliteScope !== 'LEO' && (
                <Entity key={dedicatedGeoFeederEntityId} id={dedicatedGeoFeederEntityId} name="GEO Satellite → Dedicated Gateway">
                    <PolylineGraphics
                        positions={dedicatedGeoFeederCallback}
                        width={commercialWidth('backhaul', 2.5)}
                        material={geoFeederMaterial}
                        depthFailMaterial={geoFeederMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* SNP Inspection: links from each connected satellite to the SNP */}
            {showCommercialInspectionLinks && snpInspectionLinks && snpInspectionLinks.map(({ id, callback }) => {
                const entityId = buildEntityId('engineering', 'inspection', 'snp-link', inspectedSNP?.name, id);
                return (
                    <HighlightedRouteSegment
                        key={entityId}
                        name={`SNP link ${id}`}
                        positions={callback}
                        width={commercialWidth('backhaul', 2)}
                        material={leoAllowedMaterial}
                        entityIdBase={entityId}
                        clampToGround={false}
                    />
                );
            })}

            {/* Gateway inspection: links from the selected gateway to each monitored GEO satellite */}
            {showCommercialInspectionLinks && selectedGatewayLinks && selectedGatewayLinks.map(({ id, name, callback }) => (
                <Entity key={buildEntityId('engineering', 'inspection', 'gateway-link', selectedGateway?.gateway_id ?? selectedGateway?.name, id)} id={buildEntityId('engineering', 'inspection', 'gateway-link', selectedGateway?.gateway_id ?? selectedGateway?.name, id)} name={`${selectedGateway?.name} → ${name}`}>
                    <PolylineGraphics
                        positions={callback}
                        width={commercialWidth('backhaul', 2.5)}
                        material={geoFeederMaterial}
                        depthFailMaterial={geoFeederMaterial}
                        clampToGround={false}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            ))}

            {/* ── LEO site-to-site routed path ─────────────────────────────────────
                Cyan: user access links  (UT A ↔ Sat A, UT B ↔ Sat B)
                Orange: feeder links     (Sat A ↔ SNP A, Sat B ↔ SNP B)
                Violet dashed: backbone  (SNP A → PoP → SNP B)

                Mounted once, whenever Site-to-Site mode is engaged (leoSiteToSiteResult
                present) — NOT re-mounted per render based on momentary availability.
                leoS2SLinks/leoS2SBackbone flip between non-null and null routinely as
                LEO satellites hand off (roughly once a second, driven by real orbital
                mechanics), and conditionally excluding these Entities from the JSX tree
                on every flip raced Resium's async mount/unmount lifecycle against
                itself, throwing Cesium "entity already exists" errors. Visibility is
                driven by the `show` prop instead (toggled in place, no remount), and
                `positions`/`position` fall back to a stable empty/hidden singleton so
                the prop type stays satisfied while hidden. */}
            {showLeoCommercialRoute && !!leoSiteToSiteResult && (
                <>
                    {/* UT A → Satellite A (user link) */}
                    <HighlightedRouteSegment
                        name="S2S: UT A → Satellite A"
                        positions={leoS2SLinks?.satACallback ?? EMPTY_POSITIONS_CALLBACK}
                        width={commercialWidth('access', 3.5, 'LEO')}
                        material={commercialS2SUserMaterial}
                        entityIdBase={routeEntityIds.leoS2SASat}
                        subdued={s2sIsSecondary}
                        show={!!leoS2SLinks}
                        visualState={engineeringVisualState('leo-access', 'LEO')}
                    />

                    {/* Satellite A → SNP A (feeder) */}
                    <HighlightedRouteSegment
                        name="S2S: Satellite A → SNP A"
                        positions={leoS2SLinks?.satAToSnpACallback ?? EMPTY_POSITIONS_CALLBACK}
                        width={commercialWidth('backhaul', 3, 'LEO')}
                        material={commercialS2SFeederMaterial}
                        entityIdBase={routeEntityIds.leoS2SSatASnpA}
                        clampToGround={false}
                        subdued={s2sIsSecondary}
                        show={!!leoS2SLinks?.satAToSnpACallback}
                        visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                    />

                    {/* SNP A → PoP (backbone) */}
                    <S2SBackboneSegment
                        name="S2S: SNP A → PoP (backbone)"
                        positions={leoS2SLinks?.snpAToPopCallback ?? EMPTY_POSITIONS_CALLBACK}
                        widthBoost={commercialBackboneBoost}
                        entityIdBase={routeEntityIds.leoS2SSnpAPop}
                        subdued={s2sIsSecondary}
                        show={!!leoS2SLinks && !leoS2SLinks.sameSNP && !!leoS2SLinks.snpAToPopCallback}
                        visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                    />

                    {/* PoP → SNP B (backbone) */}
                    <S2SBackboneSegment
                        name="S2S: PoP → SNP B (backbone)"
                        positions={leoS2SLinks?.popToSnpBCallback ?? EMPTY_POSITIONS_CALLBACK}
                        widthBoost={commercialBackboneBoost}
                        entityIdBase={routeEntityIds.leoS2SPopSnpB}
                        subdued={s2sIsSecondary}
                        show={!!leoS2SLinks && !leoS2SLinks.sameSNP && !!leoS2SLinks.popToSnpBCallback}
                        visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                    />

                    {/* SNP A → SNP B direct (when same SNP or no PoP) */}
                    <S2SBackboneSegment
                        name="S2S: Same SNP (backbone collapsed)"
                        positions={leoS2SLinks?.sameSnpCallback ?? EMPTY_POSITIONS_CALLBACK}
                        widthBoost={commercialBackboneBoost}
                        entityIdBase={routeEntityIds.leoS2SBackboneSame}
                        subdued={s2sIsSecondary}
                        show={!!leoS2SLinks?.sameSNP && !!leoS2SLinks.sameSnpCallback}
                        visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                    />

                    {/* SNP B → Satellite B (feeder) */}
                    <HighlightedRouteSegment
                        name="S2S: SNP B → Satellite B"
                        positions={leoS2SLinks?.satBToSnpBCallback ?? EMPTY_POSITIONS_CALLBACK}
                        width={commercialWidth('backhaul', 3, 'LEO')}
                        material={commercialS2SFeederMaterial}
                        entityIdBase={routeEntityIds.leoS2SSnpBSatB}
                        clampToGround={false}
                        subdued={s2sIsSecondary}
                        show={!!leoS2SLinks?.satBToSnpBCallback}
                        visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                    />

                    {/* Satellite B → UT B (user link) */}
                    <HighlightedRouteSegment
                        name="S2S: Satellite B → UT B"
                        positions={leoS2SLinks?.satBCallback ?? EMPTY_POSITIONS_CALLBACK}
                        width={commercialWidth('destination', 3.5, 'LEO')}
                        material={commercialS2SUserMaterial}
                        entityIdBase={routeEntityIds.leoS2SSatBB}
                        subdued={s2sIsSecondary}
                        show={!!leoS2SLinks}
                        visualState={engineeringVisualState('leo-site-b', 'LEO')}
                    />

                    {/* Focused-stage annotations (one per mapped segment) */}
                    <EngineeringSegmentAnnotation
                        entityId={`${routeEntityIds.leoS2SASat}-annotation`}
                        text={segmentAnnotation('leo-access', 'LEO')}
                        positions={leoS2SLinks?.satACallback ?? EMPTY_POSITIONS_CALLBACK}
                        show={!!leoS2SLinks}
                    />
                    <EngineeringSegmentAnnotation
                        entityId={`${routeEntityIds.leoS2SSatASnpA}-annotation`}
                        text={segmentAnnotation('leo-backhaul', 'LEO')}
                        positions={leoS2SLinks?.satAToSnpACallback ?? EMPTY_POSITIONS_CALLBACK}
                        show={!!leoS2SLinks?.satAToSnpACallback}
                    />
                    <EngineeringSegmentAnnotation
                        entityId={`${routeEntityIds.leoS2SSatBB}-annotation`}
                        text={segmentAnnotation('leo-site-b', 'LEO')}
                        positions={leoS2SLinks?.satBCallback ?? EMPTY_POSITIONS_CALLBACK}
                        show={!!leoS2SLinks}
                    />

                    {/* ── Ground-node markers ─────────────────────────────────────── */}

                    {/* SNP A marker */}
                    <Entity
                        key={routeEntityIds.leoS2SSnpAMarker}
                        id={routeEntityIds.leoS2SSnpAMarker}
                        name={`S2S: SNP ${leoS2SLinks?.snpAName ?? ''}`}
                        position={leoS2SLinks?.snpAPos ?? HIDDEN_ENTITY_POSITION}
                        description={leoS2SLinks?.snpAName ? `SNP A — ${leoS2SLinks.snpAName}` : ''}
                        show={!!(leoS2SLinks?.snpAPos && leoS2SLinks?.snpAName)}
                    >
                        <PointGraphics
                            pixelSize={commercialMode ? (commercialBackboneFocused ? 9 : 6) : 10}
                            color={Color.fromCssColorString('#f97316').withAlpha(commercialMode && !commercialBackboneFocused ? 0.52 : 1)}
                            outlineColor={Color.fromCssColorString('#fff7ed').withAlpha(commercialMode && !commercialBackboneFocused ? 0.42 : 1)}
                            outlineWidth={commercialMode && !commercialBackboneFocused ? 1 : 1.5}
                        />
                        {(!commercialMode || commercialBackboneFocused) && (
                            <LabelGraphics
                                text={`SNP A\n${leoS2SLinks?.snpAName ?? ''}`}
                                font="bold 11px sans-serif"
                                fillColor={Color.fromCssColorString('#f97316')}
                                outlineColor={Color.BLACK}
                                outlineWidth={2}
                                style={LabelStyle.FILL_AND_OUTLINE}
                                verticalOrigin={VerticalOrigin.BOTTOM}
                                horizontalOrigin={HorizontalOrigin.CENTER}
                                pixelOffset={new Cartesian2(0, -14)}
                                disableDepthTestDistance={Number.POSITIVE_INFINITY}
                                scale={commercialMode ? 0.78 : 0.9}
                            />
                        )}
                    </Entity>

                    {/* SNP B marker (skip if same SNP) */}
                    <Entity
                        key={routeEntityIds.leoS2SSnpBMarker}
                        id={routeEntityIds.leoS2SSnpBMarker}
                        name={`S2S: SNP ${leoS2SLinks?.snpBName ?? ''}`}
                        position={leoS2SLinks?.snpBPos ?? HIDDEN_ENTITY_POSITION}
                        description={leoS2SLinks?.snpBName ? `SNP B — ${leoS2SLinks.snpBName}` : ''}
                        show={!!(!leoS2SLinks?.sameSNP && leoS2SLinks?.snpBPos && leoS2SLinks?.snpBName)}
                    >
                        <PointGraphics
                            pixelSize={commercialMode ? (commercialBackboneFocused ? 9 : 6) : 10}
                            color={Color.fromCssColorString('#f97316').withAlpha(commercialMode && !commercialBackboneFocused ? 0.52 : 1)}
                            outlineColor={Color.fromCssColorString('#fff7ed').withAlpha(commercialMode && !commercialBackboneFocused ? 0.42 : 1)}
                            outlineWidth={commercialMode && !commercialBackboneFocused ? 1 : 1.5}
                        />
                        {(!commercialMode || commercialBackboneFocused) && (
                            <LabelGraphics
                                text={`SNP B\n${leoS2SLinks?.snpBName ?? ''}`}
                                font="bold 11px sans-serif"
                                fillColor={Color.fromCssColorString('#f97316')}
                                outlineColor={Color.BLACK}
                                outlineWidth={2}
                                style={LabelStyle.FILL_AND_OUTLINE}
                                verticalOrigin={VerticalOrigin.BOTTOM}
                                horizontalOrigin={HorizontalOrigin.CENTER}
                                pixelOffset={new Cartesian2(0, -14)}
                                disableDepthTestDistance={Number.POSITIVE_INFINITY}
                                scale={commercialMode ? 0.78 : 0.9}
                            />
                        )}
                    </Entity>

                    {/* Logical PoP marker */}
                    <Entity
                        key={routeEntityIds.leoS2SPopMarker}
                        id={routeEntityIds.leoS2SPopMarker}
                        name={`S2S: PoP ${leoS2SLinks?.popName ?? ''}`}
                        position={leoS2SLinks?.popPos ?? HIDDEN_ENTITY_POSITION}
                        description={leoS2SLinks ? `Logical Point of Presence: ${leoS2SLinks.popName}. Represents OneWeb core interconnect. Actual routing is proprietary.` : ''}
                        show={!!(!leoS2SLinks?.sameSNP && leoS2SLinks?.popPos)}
                    >
                        <PointGraphics
                            pixelSize={commercialMode ? (commercialBackboneFocused ? 10 : 6) : 13}
                            color={Color.fromCssColorString('#8b5cf6').withAlpha(commercialMode && !commercialBackboneFocused ? 0.48 : 1)}
                            outlineColor={Color.fromCssColorString('#ede9fe').withAlpha(commercialMode && !commercialBackboneFocused ? 0.36 : 1)}
                            outlineWidth={commercialMode && !commercialBackboneFocused ? 1 : 2}
                        />
                        {(!commercialMode || commercialBackboneFocused) && (
                            <LabelGraphics
                                text={`PoP\n${leoS2SLinks?.popName ?? ''}`}
                                font="bold 11px sans-serif"
                                fillColor={Color.fromCssColorString('#a78bfa')}
                                outlineColor={Color.BLACK}
                                outlineWidth={2}
                                style={LabelStyle.FILL_AND_OUTLINE}
                                verticalOrigin={VerticalOrigin.BOTTOM}
                                horizontalOrigin={HorizontalOrigin.CENTER}
                                pixelOffset={new Cartesian2(0, -16)}
                                disableDepthTestDistance={Number.POSITIVE_INFINITY}
                                scale={commercialMode ? 0.78 : 0.9}
                            />
                        )}
                    </Entity>

                    {/* ── "Service unavailable" backbone-only fallback ──────────────
                        Distinct ids from the full-route pieces above (see
                        routeEntityIds.*Fallback) so both sets can safely stay mounted
                        simultaneously — only one set is ever show=true at a time,
                        since leoS2SLinks and leoS2SBackbone are mutually exclusive by
                        construction (see their useMemo definitions above). */}
                    <S2SBackboneSegment
                        name="S2S: SNP A → PoP (backbone, service unavailable)"
                        positions={leoS2SBackbone?.snpAToPopCallback ?? EMPTY_POSITIONS_CALLBACK}
                        entityIdBase={routeEntityIds.leoS2SSnpAPopFallback}
                        subdued
                        show={!!leoS2SBackbone && !leoS2SBackbone.sameSNP && !!leoS2SBackbone.snpAToPopCallback}
                        visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                    />
                    <S2SBackboneSegment
                        name="S2S: PoP → SNP B (backbone, service unavailable)"
                        positions={leoS2SBackbone?.popToSnpBCallback ?? EMPTY_POSITIONS_CALLBACK}
                        entityIdBase={routeEntityIds.leoS2SPopSnpBFallback}
                        subdued
                        show={!!leoS2SBackbone && !leoS2SBackbone.sameSNP && !!leoS2SBackbone.popToSnpBCallback}
                        visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                    />
                    <S2SBackboneSegment
                        name="S2S: Same SNP (backbone collapsed, service unavailable)"
                        positions={leoS2SBackbone?.sameSnpCallback ?? EMPTY_POSITIONS_CALLBACK}
                        entityIdBase={routeEntityIds.leoS2SBackboneSameFallback}
                        subdued
                        show={!!leoS2SBackbone?.sameSNP && !!leoS2SBackbone.sameSnpCallback}
                        visualState={engineeringVisualState('leo-backhaul', 'LEO')}
                    />
                    <Entity
                        key={routeEntityIds.leoS2SSnpAMarkerFallback}
                        id={routeEntityIds.leoS2SSnpAMarkerFallback}
                        name={`S2S: SNP ${leoS2SBackbone?.snpAName ?? ''}`}
                        position={leoS2SBackbone?.snpAPos ?? HIDDEN_ENTITY_POSITION}
                        show={!!(leoS2SBackbone?.snpAPos && leoS2SBackbone?.snpAName)}
                    >
                        <PointGraphics
                            pixelSize={10}
                            color={Color.fromCssColorString('#f97316').withAlpha(0.55)}
                            outlineColor={Color.fromCssColorString('#fff7ed').withAlpha(0.45)}
                            outlineWidth={1.5}
                        />
                        <LabelGraphics
                            text={`SNP A\n${leoS2SBackbone?.snpAName ?? ''}`}
                            font="bold 11px sans-serif"
                            fillColor={Color.fromCssColorString('#f97316').withAlpha(0.72)}
                            outlineColor={Color.BLACK}
                            outlineWidth={2}
                            style={LabelStyle.FILL_AND_OUTLINE}
                            verticalOrigin={VerticalOrigin.BOTTOM}
                            horizontalOrigin={HorizontalOrigin.CENTER}
                            pixelOffset={new Cartesian2(0, -14)}
                            disableDepthTestDistance={Number.POSITIVE_INFINITY}
                            scale={0.9}
                        />
                    </Entity>
                    <Entity
                        key={routeEntityIds.leoS2SSnpBMarkerFallback}
                        id={routeEntityIds.leoS2SSnpBMarkerFallback}
                        name={`S2S: SNP ${leoS2SBackbone?.snpBName ?? ''}`}
                        position={leoS2SBackbone?.snpBPos ?? HIDDEN_ENTITY_POSITION}
                        show={!!(!leoS2SBackbone?.sameSNP && leoS2SBackbone?.snpBPos && leoS2SBackbone?.snpBName)}
                    >
                        <PointGraphics
                            pixelSize={10}
                            color={Color.fromCssColorString('#f97316').withAlpha(0.55)}
                            outlineColor={Color.fromCssColorString('#fff7ed').withAlpha(0.45)}
                            outlineWidth={1.5}
                        />
                        <LabelGraphics
                            text={`SNP B\n${leoS2SBackbone?.snpBName ?? ''}`}
                            font="bold 11px sans-serif"
                            fillColor={Color.fromCssColorString('#f97316').withAlpha(0.72)}
                            outlineColor={Color.BLACK}
                            outlineWidth={2}
                            style={LabelStyle.FILL_AND_OUTLINE}
                            verticalOrigin={VerticalOrigin.BOTTOM}
                            horizontalOrigin={HorizontalOrigin.CENTER}
                            pixelOffset={new Cartesian2(0, -14)}
                            disableDepthTestDistance={Number.POSITIVE_INFINITY}
                            scale={0.9}
                        />
                    </Entity>
                    <Entity
                        key={routeEntityIds.leoS2SPopMarkerFallback}
                        id={routeEntityIds.leoS2SPopMarkerFallback}
                        name={`S2S: PoP ${leoS2SBackbone?.popName ?? ''}`}
                        position={leoS2SBackbone?.popPos ?? HIDDEN_ENTITY_POSITION}
                        show={!!(!leoS2SBackbone?.sameSNP && leoS2SBackbone?.popPos)}
                    >
                        <PointGraphics
                            pixelSize={13}
                            color={Color.fromCssColorString('#8b5cf6').withAlpha(0.50)}
                            outlineColor={Color.fromCssColorString('#ede9fe').withAlpha(0.38)}
                            outlineWidth={2}
                        />
                        <LabelGraphics
                            text={`PoP\n${leoS2SBackbone?.popName ?? ''}`}
                            font="bold 11px sans-serif"
                            fillColor={Color.fromCssColorString('#a78bfa').withAlpha(0.72)}
                            outlineColor={Color.BLACK}
                            outlineWidth={2}
                            style={LabelStyle.FILL_AND_OUTLINE}
                            verticalOrigin={VerticalOrigin.BOTTOM}
                            horizontalOrigin={HorizontalOrigin.CENTER}
                            pixelOffset={new Cartesian2(0, -16)}
                            disableDepthTestDistance={Number.POSITIVE_INFINITY}
                            scale={0.9}
                        />
                    </Entity>
                </>
            )}
            <PathFlowAnimation
                enabled={showFlowAnimation}
                segments={flowSegments}
                cameraMetricsRef={cameraMetricsRef}
            />
        </>
    );
};

export default React.memo(TransmissionLinks);
