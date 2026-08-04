/**
 * TrajectoryLayer - Renders satellite orbit trajectory
 */
import React, { useEffect, useMemo } from 'react';
import { Entity, PolylineGraphics, useCesium } from 'resium';
import {
    Cartesian3,
    Color,
    CallbackProperty
} from 'cesium';
import * as satellite from 'satellite.js';
import type { SatelliteData } from '../../types/satellites';
import { requestGlobeRender } from '../../utils/globeRenderRequest';
import { useSimulationClock } from '../../contexts/SimulationClockContext';

interface TrajectoryLayerProps {
    satellite: SatelliteData | null;
    show: boolean;
}

const TrajectoryLayer: React.FC<TrajectoryLayerProps> = ({
    satellite: sat,
    show
}) => {
    const simulationClock = useSimulationClock();
    // This layer takes no viewerRef prop, so the viewer comes from Resium's
    // context instead — the same source CoverageLayer and FillRateLayer use.
    const { viewer } = useCesium();

    // requestRenderMode wiring, step 2b.2 (Group B: data-cadence followers).
    // BEHAVIOUR-NEUTRAL: requestRender() is a no-op while scene.requestRenderMode
    // is false, which is the current configuration. The trajectory is recomputed
    // when the selected satellite or visibility changes, not per frame.
    useEffect(() => {
        requestGlobeRender(viewer);
    }, [viewer, sat, show]);

    // Create stable positions callback
    const positionsCallback = useMemo(() => {
        if (!sat?.satrec || !show) return null;

        return new CallbackProperty(() => {
            const trajectoryPoints: Cartesian3[] = [];
            const period = sat.type === 'EUTELSAT' ? 1440 : 110; // minutes (GEO: 24h, LEO: ~2h)
            const timeStep = 5; // minutes
            const scenarioStartMs = simulationClock.getTimeMs();

            for (let minutes = 0; minutes <= period; minutes += timeStep) {
                try {
                    const date = new Date(scenarioStartMs + minutes * 60000);
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
    }, [sat?.satrec, sat?.type, show, simulationClock]);

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
