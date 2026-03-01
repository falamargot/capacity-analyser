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

const geoDashMaterial = new PolylineDashMaterialProperty({
    color: Color.ROYALBLUE,
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

    // LEO Uplink positions callback
    const leoUplinkCallback = useMemo(() => {
        if (!autoSelectedLEOSatellite || !hasUserSelection) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            // Point A: Aircraft or fixed position
            const startPos = selectedAircraft
                ? calculateDeadReckoning(selectedAircraft, time)
                : getPosition(selectedPosition!.lat, selectedPosition!.lng, selectedPosition!.altitude || 0);
            
            // Get user location for RF connectivity check
            const userLocation = selectedAircraft 
                ? (() => {
                    const pos = calculateDeadReckoning(selectedAircraft, time);
                    const carto = Cartographic.fromCartesian(pos);
                    return {
                        lat: CesiumMath.toDegrees(carto.latitude),
                        lng: CesiumMath.toDegrees(carto.longitude)
                    };
                  })()
                : { lat: selectedPosition!.lat, lng: selectedPosition!.lng };

            // Check RF connectivity before rendering link
            if (!hasRFConnectivity(userLocation, autoSelectedLEOSatellite, time, coveragePolicy)) {
                return []; // No link if no RF connectivity
            }

            // Point B: LEO Satellite
            const endPos = propagateSatellite(autoSelectedLEOSatellite, time);

            return [startPos, endPos];
        }, false);
    }, [autoSelectedLEOSatellite, selectedAircraft, selectedPosition, hasUserSelection, coveragePolicy]);

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

    // GEO Link positions callback
    const geoLinkCallback = useMemo(() => {
        if (!autoSelectedGEOSatellite || !hasUserSelection) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const startPos = selectedAircraft
                ? calculateDeadReckoning(selectedAircraft, time)
                : getPosition(selectedPosition!.lat, selectedPosition!.lng, selectedPosition!.altitude || 0);

            const endPos = propagateSatellite(autoSelectedGEOSatellite, time);

            return [startPos, endPos];
        }, false);
    }, [autoSelectedGEOSatellite, selectedAircraft, selectedPosition, hasUserSelection]);

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
                        width={2}
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
                        width={2}
                        material={leoDashMaterial}
                        clampToGround={false}
                        arcType={ArcType.NONE}
                    />
                </Entity>
            )}

            {/* GEO Link */}
            {geoLinkCallback && satelliteScope !== 'LEO' && (
                <Entity name="GEO Uplink/Downlink">
                    <PolylineGraphics
                        positions={geoLinkCallback}
                        width={2}
                        material={geoDashMaterial}
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
