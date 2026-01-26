/**
 * TrajectoryLayer - Renders satellite orbit trajectory
 */
import React, { useMemo } from 'react';
import { Entity, PolylineGraphics } from 'resium';
import {
    Cartesian3,
    Color,
    CallbackProperty
} from 'cesium';
import * as satellite from 'satellite.js';
import type { SatelliteData } from '../../types/satellites';

interface TrajectoryLayerProps {
    satellite: SatelliteData | null;
    show: boolean;
}

const TrajectoryLayer: React.FC<TrajectoryLayerProps> = ({
    satellite: sat,
    show
}) => {
    // Create stable positions callback
    const positionsCallback = useMemo(() => {
        if (!sat?.satrec || !show) return null;

        return new CallbackProperty(() => {
            const trajectoryPoints: Cartesian3[] = [];
            const period = sat.type === 'EUTELSAT' ? 1440 : 110; // minutes (GEO: 24h, LEO: ~2h)
            const timeStep = 5; // minutes

            for (let minutes = 0; minutes <= period; minutes += timeStep) {
                try {
                    const date = new Date(Date.now() + minutes * 60000);
                    const positionAndVelocity = satellite.propagate(sat.satrec, date);

                    if (positionAndVelocity?.position && typeof positionAndVelocity.position !== 'boolean') {
                        const gmst = satellite.gstime(date);
                        const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
                        const lat = satellite.degreesLat(geoPosition.latitude);
                        const lng = satellite.degreesLong(geoPosition.longitude);
                        const alt = geoPosition.height * 1000;

                        if (isFinite(lat) && isFinite(lng) && isFinite(alt)) {
                            trajectoryPoints.push(Cartesian3.fromDegrees(lng, lat, alt));
                        }
                    }
                } catch {
                    // Skip this point if calculation fails
                }
            }

            return trajectoryPoints;
        }, false);
    }, [sat?.id, sat?.satrec, sat?.type, show]);

    if (!sat?.satrec || !show || !positionsCallback) {
        return null;
    }

    return (
        <Entity name={`${sat.name} Trajectory`}>
            <PolylineGraphics
                positions={positionsCallback}
                width={2}
                material={Color.RED}
                clampToGround={false}
            />
        </Entity>
    );
};

export default React.memo(TrajectoryLayer);
