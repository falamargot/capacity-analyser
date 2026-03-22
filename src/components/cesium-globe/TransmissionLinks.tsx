/**
 * TransmissionLinks - Renders satellite/aircraft communication links
 */
import React, { useMemo } from 'react';
import { Entity, PolylineGraphics } from 'resium';
import {
    Cartesian3,
    Color,
    CallbackProperty,
    CallbackPositionProperty,
    JulianDate,
    LabelStyle,
    PolylineDashMaterialProperty,
    PolylineGlowMaterialProperty,
    ArcType,
    Cartographic,
    Math as CesiumMath,
    VerticalOrigin,
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { getPosition, propagateSatellite, calculateDeadReckoning } from './utils';
import { hasRFConnectivity } from '../../utils/rfConnectivity';
import { useSimulation } from '../../contexts/SimulationContext';
import { GEO_GATEWAYS, type GeoGatewayData, type SNPData } from '../globe/GlobeConfig';
import { getAssignedGeoSatellitesForGateway, getGatewayAssignmentsForSatellite, selectBestGeoGateway } from '../../utils/geoConnectivityModel';
import type { SNPConnectedSatellite } from '../../services/coverageService';
import { buildSimulationStateSnapshot } from '../../types/simulation';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { RegulatoryBlockedPathMaterialProperty } from './materials/regulatoryMaterials';

interface TransmissionLinksProps {
    satellites: SatelliteData[];
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
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

const geoFeederMaterial = new PolylineDashMaterialProperty({
    color: Color.ROYALBLUE,
    dashPattern: 3855
});

const geoBackhaulMaterial = new PolylineDashMaterialProperty({
    color: Color.GRAY,
    dashPattern: 3855
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

const TransmissionLinks: React.FC<TransmissionLinksProps> = ({
    satellites,
    selectedPosition,
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
}) => {
    const { coveragePolicy, weatherCondition, beamHealthFactors, hsBeamsSet } = useSimulation();
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

    const resolveCurrentUser = useMemo(() => {
        return (time: JulianDate) => {
            const userPosition = selectedAircraft
                ? calculateDeadReckoning(selectedAircraft, time)
                : getPosition(selectedPosition!.lat, selectedPosition!.lng, selectedPosition!.altitude || 0);

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

            // Point B: LEO Satellite
            const endPos = propagateSatellite(autoSelectedLEOSatellite, time);

            return [startPos, endPos];
        }, false);
    }, [autoSelectedLEOSatellite, hasUserSelection, resolveCurrentUser, simulationState]);

    // LEO Backhaul positions callback (to SNP)
    const leoBackhaulCallback = useMemo(() => {
        if (!autoSelectedLEOSatellite || !selectedSNP?.lat || !selectedSNP?.lng) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const satPos = propagateSatellite(autoSelectedLEOSatellite, time);
            const snpPos = getPosition(selectedSNP.lat, selectedSNP.lng, 0.01);

            return [satPos, snpPos];
        }, false);
    }, [autoSelectedLEOSatellite, selectedSNP]);

    /**
     * VIZ-3 — Bent-pipe signal pulse animation.
     * A point entity travels User → Satellite → SNP to visualise the two-hop
     * radio path of OneWeb's no-ISL architecture.  One round-trip completes in
     * PULSE_PERIOD_S seconds so the animation matches human perception.
     *
     * Signal timing proportions (not to exact RTT scale for perceptibility):
     *   0 → 0.45  : User terminal → Satellite   (Ku-band uplink)
     *   0.45 → 0.9 : Satellite → SNP            (Ka-band feeder)
     *   0.9 → 1.0  : SNP → teleport (fiber→PoP delay represented by pause)
     */
    const PULSE_PERIOD_S = 3.5;

    const bentPipePulsePosition = useMemo(() => {
        if (!autoSelectedLEOSatellite || !hasUserSelection || !selectedSNP?.lat || !selectedSNP?.lng) return null;

        return new CallbackPositionProperty((time?: JulianDate) => {
            if (!time) return Cartesian3.ZERO;

            const t = JulianDate.toDate(time).getTime() / 1000;
            const phase = ((t % PULSE_PERIOD_S) / PULSE_PERIOD_S + 1) % 1; // 0 → 1

            const { userPosition: userPos } = resolveCurrentUser(time);
            const satPos = propagateSatellite(autoSelectedLEOSatellite, time);
            const snpPos = getPosition(selectedSNP.lat, selectedSNP.lng, 0.01);

            if (phase < 0.45) {
                // User → Satellite (Ku-band uplink)
                const f = phase / 0.45;
                return Cartesian3.lerp(userPos, satPos, f, new Cartesian3());
            } else if (phase < 0.9) {
                // Satellite → SNP (Ka-band feeder link)
                const f = (phase - 0.45) / 0.45;
                return Cartesian3.lerp(satPos, snpPos, f, new Cartesian3());
            } else {
                // Pause at SNP (fiber + PoP delay)
                return snpPos;
            }
        }, false);
    }, [autoSelectedLEOSatellite, hasUserSelection, selectedSNP, resolveCurrentUser]);

    const bentPipePulseColor = useMemo(() => {
        if (!bentPipePulsePosition) return null;
        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return Color.CYAN.withAlpha(0.9);
            const t = JulianDate.toDate(time).getTime() / 1000;
            const phase = ((t % PULSE_PERIOD_S) / PULSE_PERIOD_S + 1) % 1;
            // Change color to indicate link segment: Ku-band (cyan) vs Ka-band (amber)
            if (phase < 0.45) {
                return Color.fromCssColorString('#67e8f9').withAlpha(0.95); // Ku-band: cyan
            } else if (phase < 0.9) {
                return Color.fromCssColorString('#fbbf24').withAlpha(0.95); // Ka-band: amber
            } else {
                return Color.fromCssColorString('#a78bfa').withAlpha(0.85); // fiber: violet
            }
        }, false);
    }, [bentPipePulsePosition]);

    // GEO User -> Satellite link
    const geoUserLinkCallback = useMemo(() => {
        if (!autoSelectedGEOSatellite || !hasUserSelection) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const { userPosition } = resolveCurrentUser(time);
            const satPos = propagateSatellite(autoSelectedGEOSatellite, time);

            return [userPosition, satPos];
        }, false);
    }, [autoSelectedGEOSatellite, hasUserSelection, resolveCurrentUser]);

    // Gateway selection — depends only on the GEO satellite position, not on user position.
    // GEO satellites barely move, so this recomputes at most when autoSelectedGEOSatellite changes.
    // Eliminates O(gateways) ECEF work from the per-frame CallbackProperty callbacks below.
    const bestGeoGateway = useMemo(() => {
        if (!autoSelectedGEOSatellite) return null;
        const assignedGateway = getGatewayAssignmentsForSatellite(autoSelectedGEOSatellite, GEO_GATEWAYS).primary;
        if (assignedGateway) {
            return {
                gateway: assignedGateway,
                gatewayElevationDeg: 0,
                satToGatewayDistanceKm: 0,
            };
        }
        return selectBestGeoGateway(autoSelectedGEOSatellite, GEO_GATEWAYS);
    }, [autoSelectedGEOSatellite]);

    // GEO Satellite -> Gateway feeder link
    const geoFeederLinkCallback = useMemo(() => {
        if (!autoSelectedGEOSatellite || !hasUserSelection || !bestGeoGateway) return null;

        // Pre-compute the static gateway position once (avoids allocation every frame)
        const gwLat = bestGeoGateway.gateway.latitude ?? bestGeoGateway.gateway.lat;
        const gwLng = bestGeoGateway.gateway.longitude ?? bestGeoGateway.gateway.lng;
        const gatewayPos = getPosition(gwLat, gwLng, 0.01);

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];
            const satPos = propagateSatellite(autoSelectedGEOSatellite, time);
            return [satPos, gatewayPos];
        }, false);
    }, [autoSelectedGEOSatellite, hasUserSelection, bestGeoGateway]);

    // GEO Gateway -> Internet backhaul (conceptual terrestrial segment)
    const geoBackhaulCallback = useMemo(() => {
        if (!autoSelectedGEOSatellite || !hasUserSelection || !bestGeoGateway) return null;

        // Both positions are fully static — no per-frame computation needed
        const gwLat = bestGeoGateway.gateway.latitude ?? bestGeoGateway.gateway.lat;
        const gwLng = bestGeoGateway.gateway.longitude ?? bestGeoGateway.gateway.lng;
        const gatewayPos = getPosition(gwLat, gwLng, 0.01);
        const internetPos = getPosition(gwLat + 0.3, gwLng + 0.3, 0.01);
        const staticPositions = [gatewayPos, internetPos];

        return new CallbackProperty((_time?: JulianDate) => staticPositions, false);
    }, [autoSelectedGEOSatellite, hasUserSelection, bestGeoGateway]);

    const dedicatedGeoGateway = useMemo(() => {
        if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') return null;
        const assignedGateway = getGatewayAssignmentsForSatellite(selectedSatellite, GEO_GATEWAYS).primary;
        if (assignedGateway) {
            return {
                gateway: assignedGateway,
                gatewayElevationDeg: 0,
                satToGatewayDistanceKm: 0,
            };
        }
        return selectBestGeoGateway(selectedSatellite, GEO_GATEWAYS);
    }, [selectedSatellite]);

    // Dedicated SNP link for manually selected LEO satellite
    const dedicatedSnpCallback = useMemo(() => {
        if (!selectedSatellite || selectedSatellite.type !== 'ONEWEB' || !dedicatedSNPForSelectedLEO || selectedSatellite.opsStatus !== 'operational') return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const satPos = propagateSatellite(selectedSatellite, time);
            const snpPos = getPosition(dedicatedSNPForSelectedLEO.lat, dedicatedSNPForSelectedLEO.lng, 0);

            return [satPos, snpPos];
        }, false);
    }, [selectedSatellite, dedicatedSNPForSelectedLEO]);

    const dedicatedGeoFeederCallback = useMemo(() => {
        if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT' || !dedicatedGeoGateway || selectedSatellite.opsStatus !== 'operational') return null;

        const gwLat = dedicatedGeoGateway.gateway.latitude ?? dedicatedGeoGateway.gateway.lat;
        const gwLng = dedicatedGeoGateway.gateway.longitude ?? dedicatedGeoGateway.gateway.lng;
        const gatewayPos = getPosition(gwLat, gwLng, 0.01);

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const satPos = propagateSatellite(selectedSatellite, time);
            return [satPos, gatewayPos];
        }, false);
    }, [selectedSatellite, dedicatedGeoGateway]);

    // SNP inspection links (one per connected satellite)
    const snpInspectionLinks = useMemo(() => {
        if (!inspectedSNP) return null;
        const snpPos = getPosition(inspectedSNP.lat, inspectedSNP.lng, 0.01);

        return snpConnectedSatellites.filter(({ satellite }) => satellite.opsStatus === 'operational').map(({ satellite }) => {
            const callback = new CallbackProperty((time?: JulianDate) => {
                if (!time) return [];
                const satPos = propagateSatellite(satellite, time);
                return [satPos, snpPos];
            }, false);
            return { id: satellite.id, callback };
        });
    }, [inspectedSNP, snpConnectedSatellites]);

    const selectedGatewayLinks = useMemo(() => {
        if (!selectedGateway || satelliteScope === 'LEO') return null;

        const gatewayPos = getPosition(selectedGateway.lat, selectedGateway.lng, 0.01);
        const assignedSatellites = getAssignedGeoSatellitesForGateway(selectedGateway, satellites, GEO_GATEWAYS);

        return [
            ...assignedSatellites.primary.map((satellite) => ({ satellite, role: 'primary' as const })),
            ...assignedSatellites.backup.map((satellite) => ({ satellite, role: 'backup' as const })),
        ]
            .filter(({ satellite }) => satellite.opsStatus === 'operational')
            .map(({ satellite, role }) => ({
                id: satellite.id,
                name: satellite.name,
                role,
                callback: new CallbackProperty((time?: JulianDate) => {
                    if (!time) return [];
                    const satPos = propagateSatellite(satellite, time);
                    return [gatewayPos, satPos];
                }, false),
            }));
    }, [selectedGateway, satelliteScope, satellites]);

    if (!hasUserSelection && !dedicatedSnpCallback && !dedicatedGeoFeederCallback && !inspectedSNP && !selectedGatewayLinks?.length) {
        return null;
    }

    return (
        <>
            {/* LEO Uplink/Downlink - User to Satellite */}
            {leoUplinkCallback && satelliteScope !== 'GEO' && (
                <Entity name="LEO Uplink/Downlink">
                    <PolylineGraphics
                        positions={leoUplinkCallback}
                        width={leoLinkWidth}
                        material={leoLinkMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* LEO Backhaul to SNP - Satellite to Gateway */}
            {leoBackhaulCallback && satelliteScope !== 'GEO' && selectedSNP && (
                <Entity name="LEO Backhaul">
                    <PolylineGraphics
                        positions={leoBackhaulCallback}
                        width={leoLinkWidth}
                        material={leoLinkMaterial}
                        clampToGround={false}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* VIZ-3 — Bent-pipe signal pulse: animated point travelling User → Sat → SNP */}
            {bentPipePulsePosition && bentPipePulseColor && satelliteScope !== 'GEO' && leoPathVisualState !== 'blocked' && (
                <Entity
                    name="Bent-pipe signal pulse"
                    position={bentPipePulsePosition}
                    point={{
                        pixelSize: new CallbackProperty(() => 10, true),
                        color: bentPipePulseColor,
                        outlineColor: Color.WHITE.withAlpha(0.6),
                        outlineWidth: 1.5,
                        scaleByDistance: undefined,
                        heightReference: undefined,
                    }}
                    label={{
                        text: new CallbackProperty((time?: JulianDate) => {
                            if (!time) return '';
                            const t = JulianDate.toDate(time).getTime() / 1000;
                            const phase = ((t % PULSE_PERIOD_S) / PULSE_PERIOD_S + 1) % 1;
                            if (phase < 0.45) return 'Ku-band';
                            if (phase < 0.9) return 'Ka-band';
                            return 'fiber';
                        }, false),
                        font: '11px monospace',
                        fillColor: Color.WHITE.withAlpha(0.9),
                        outlineColor: Color.BLACK.withAlpha(0.6),
                        outlineWidth: 2,
                        style: LabelStyle.FILL_AND_OUTLINE,
                        pixelOffset: new CallbackProperty(() => ({ x: 12, y: -8 }), true) as any,
                        verticalOrigin: VerticalOrigin.BOTTOM,
                        showBackground: false,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    }}
                />
            )}

            {/* GEO User -> Satellite */}
            {geoUserLinkCallback && satelliteScope !== 'LEO' && (
                <Entity name="GEO User Link">
                    <PolylineGraphics
                        positions={geoUserLinkCallback}
                        width={2.5}
                        material={geoUserMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* GEO Satellite -> Gateway */}
            {geoFeederLinkCallback && satelliteScope !== 'LEO' && (
                <Entity name="GEO Feeder Link">
                    <PolylineGraphics
                        positions={geoFeederLinkCallback}
                        width={2.5}
                        material={geoFeederMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* GEO Gateway -> Internet */}
            {geoBackhaulCallback && satelliteScope !== 'LEO' && (
                <Entity name="GEO Backhaul Link">
                    <PolylineGraphics
                        positions={geoBackhaulCallback}
                        width={2.5}
                        material={geoBackhaulMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* Dedicated SNP Link for manually selected satellite */}
            {dedicatedSnpCallback && (
                <Entity name="LEO Satellite → Dedicated SNP">
                    <PolylineGraphics
                        positions={dedicatedSnpCallback}
                        width={leoPathVisualState === 'blocked' ? 2.4 : 2}
                        clampToGround={false}
                        material={leoLinkMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* Dedicated Gateway Link for manually selected GEO satellite */}
            {dedicatedGeoFeederCallback && satelliteScope !== 'LEO' && (
                <Entity name="GEO Satellite → Dedicated Gateway">
                    <PolylineGraphics
                        positions={dedicatedGeoFeederCallback}
                        width={2.5}
                        material={geoFeederMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* SNP Inspection: links from each connected satellite to the SNP */}
            {snpInspectionLinks && snpInspectionLinks.map(({ id, callback }) => (
                <Entity key={`snp-link-${id}`} name={`SNP link ${id}`}>
                    <PolylineGraphics
                        positions={callback}
                        width={2}
                        material={leoAllowedMaterial}
                        clampToGround={false}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            ))}

            {/* Gateway inspection: links from the selected gateway to each monitored GEO satellite */}
            {selectedGatewayLinks && selectedGatewayLinks.map(({ id, name, role, callback }) => (
                <Entity key={`gateway-link-${id}`} name={`${selectedGateway?.name} → ${name}`}>
                    <PolylineGraphics
                        positions={callback}
                        width={role === 'backup' ? 1.5 : 2.5}
                        material={geoFeederMaterial}
                        clampToGround={false}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            ))}
        </>
    );
};

export default React.memo(TransmissionLinks);
