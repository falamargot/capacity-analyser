/**
 * TransmissionLinks - Renders satellite/aircraft communication links
 */
import React, { useMemo } from 'react';
import { Entity, PolylineGraphics } from 'resium';
import {
    Color,
    CallbackProperty,
    JulianDate,
    PolylineDashMaterialProperty,
    ArcType,
    Cartographic,
    Math as CesiumMath
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { getPosition, propagateSatellite, calculateDeadReckoning } from './utils';
import { hasRFConnectivity } from '../../utils/rfConnectivity';
import { useSimulation } from '../../contexts/SimulationContext';
import { GEO_GATEWAYS } from '../globe/GlobeConfig';
import { selectBestGeoGateway } from '../../utils/geoConnectivityModel';

interface TransmissionLinksProps {
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    selectedAircraft?: Aircraft | null;
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    selectedSNP?: { lat: number; lng: number; name: string } | null;
    dedicatedSNPForSelectedLEO?: { lat: number; lng: number } | null;
    satelliteScope: SatelliteScope;
}

// Dashed material cache
const leoDashMaterial = new PolylineDashMaterialProperty({
    color: Color.PALEVIOLETRED,
    dashPattern: 3855
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

const TransmissionLinks: React.FC<TransmissionLinksProps> = ({
    selectedPosition,
    selectedAircraft,
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    selectedSNP,
    dedicatedSNPForSelectedLEO,
    satelliteScope
}) => {
    const { coveragePolicy } = useSimulation();
    const hasUserSelection = !!(selectedPosition || selectedAircraft);

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
            if (!hasRFConnectivity(userLocation, autoSelectedLEOSatellite, time, coveragePolicy)) {
                return []; // No link if no RF connectivity
            }

            // Point B: LEO Satellite
            const endPos = propagateSatellite(autoSelectedLEOSatellite, time);

            return [startPos, endPos];
        }, false);
    }, [autoSelectedLEOSatellite, hasUserSelection, coveragePolicy, resolveCurrentUser]);

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

    // Dedicated SNP link for manually selected LEO satellite
    const dedicatedSnpCallback = useMemo(() => {
        if (!selectedSatellite || selectedSatellite.type !== 'ONEWEB' || !dedicatedSNPForSelectedLEO) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const satPos = propagateSatellite(selectedSatellite, time);
            const snpPos = getPosition(dedicatedSNPForSelectedLEO.lat, dedicatedSNPForSelectedLEO.lng, 0);

            return [satPos, snpPos];
        }, false);
    }, [selectedSatellite, dedicatedSNPForSelectedLEO]);

    if (!hasUserSelection && !dedicatedSnpCallback) {
        return null;
    }

    return (
        <>
            {/* LEO Uplink/Downlink - User to Satellite */}
            {leoUplinkCallback && satelliteScope !== 'GEO' && (
                <Entity name="LEO Uplink/Downlink">
                    <PolylineGraphics
                        positions={leoUplinkCallback}
                        width={2.5}
                        material={leoDashMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* LEO Backhaul to SNP - Satellite to Gateway */}
            {leoBackhaulCallback && satelliteScope !== 'GEO' && selectedSNP && (
                <Entity name="LEO Backhaul">
                    <PolylineGraphics
                        positions={leoBackhaulCallback}
                        width={2.5}
                        material={leoDashMaterial}
                        clampToGround={false}
                        arcType={ArcType.NONE}
                    />
                </Entity>
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
                        width={2}
                        clampToGround={false}
                        material={leoDashMaterial}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}
        </>
    );
};

export default React.memo(TransmissionLinks);
