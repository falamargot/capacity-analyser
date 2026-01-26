/**
 * TransmissionLinks - Renders satellite/aircraft communication links
 */
import React, { useMemo } from 'react';
import { Entity, PolylineGraphics } from 'resium';
import {
    Color,
    CallbackProperty,
    JulianDate,
    PolylineDashMaterialProperty
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { getPosition, propagateSatellite, calculateDeadReckoning } from './utils';

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

            // Point B: LEO Satellite
            const endPos = propagateSatellite(autoSelectedLEOSatellite, time);

            return [startPos, endPos];
        }, false);
    }, [autoSelectedLEOSatellite?.id, selectedAircraft?.icao24, selectedPosition?.lat, selectedPosition?.lng, hasUserSelection]);

    // LEO Backhaul positions callback (to SNP)
    const leoBackhaulCallback = useMemo(() => {
        if (!autoSelectedLEOSatellite || !selectedSNP?.lat || !selectedSNP?.lng) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const satPos = propagateSatellite(autoSelectedLEOSatellite, time);
            const snpPos = getPosition(selectedSNP.lat, selectedSNP.lng, 0.01);

            return [satPos, snpPos];
        }, false);
    }, [autoSelectedLEOSatellite?.id, selectedSNP?.lat, selectedSNP?.lng]);

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
    }, [autoSelectedGEOSatellite?.id, selectedAircraft?.icao24, selectedPosition?.lat, selectedPosition?.lng, hasUserSelection]);

    // Dedicated SNP link for manually selected LEO satellite
    const dedicatedSnpCallback = useMemo(() => {
        if (!selectedSatellite || selectedSatellite.type !== 'ONEWEB' || !dedicatedSNPForSelectedLEO) return null;

        return new CallbackProperty((time?: JulianDate) => {
            if (!time) return [];

            const satPos = propagateSatellite(selectedSatellite, time);
            const snpPos = getPosition(dedicatedSNPForSelectedLEO.lat, dedicatedSNPForSelectedLEO.lng, 0);

            return [satPos, snpPos];
        }, false);
    }, [selectedSatellite?.id, selectedSatellite?.type, dedicatedSNPForSelectedLEO?.lat, dedicatedSNPForSelectedLEO?.lng]);

    if (!hasUserSelection && !dedicatedSnpCallback) {
        return null;
    }

    return (
        <>
            {/* LEO Uplink/Downlink */}
            {leoUplinkCallback && satelliteScope !== 'GEO' && selectedSNP && (
                <Entity name="LEO Uplink/Downlink">
                    <PolylineGraphics
                        positions={leoUplinkCallback}
                        width={3}
                        material={leoDashMaterial}
                    />
                </Entity>
            )}

            {/* LEO Backhaul to SNP */}
            {leoBackhaulCallback && satelliteScope !== 'GEO' && (
                <Entity name="LEO Backhaul">
                    <PolylineGraphics
                        positions={leoBackhaulCallback}
                        width={3}
                        material={leoDashMaterial}
                        clampToGround={false}
                    />
                </Entity>
            )}

            {/* GEO Link */}
            {geoLinkCallback && satelliteScope !== 'LEO' && (
                <Entity name="GEO Uplink/Downlink">
                    <PolylineGraphics
                        positions={geoLinkCallback}
                        width={3}
                        material={geoDashMaterial}
                    />
                </Entity>
            )}

            {/* Dedicated SNP Link for manually selected satellite */}
            {dedicatedSnpCallback && (
                <Entity name="LEO Satellite → Dedicated SNP">
                    <PolylineGraphics
                        positions={dedicatedSnpCallback}
                        width={3}
                        clampToGround={false}
                        material={leoDashMaterial}
                    />
                </Entity>
            )}
        </>
    );
};

export default React.memo(TransmissionLinks);
