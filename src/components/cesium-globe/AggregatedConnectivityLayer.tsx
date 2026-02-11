import React, { useMemo } from 'react';
import { Entity, RectangleGraphics } from 'resium';
import {
    Color
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { generateCoverageGrid } from './utils/gridCoverage';

interface AggregatedConnectivityLayerProps {
    satelliteScope: SatelliteScope;
    satellites: SatelliteData[];
    show: boolean;
}

const AggregatedConnectivityLayer: React.FC<AggregatedConnectivityLayerProps> = ({
    satelliteScope,
    satellites,
    show
}) => {
    // Generate the binary grid
    // Memoized to avoid re-calculation on every frame, only when satellites move/update
    // Note: Satellites update every second (throttled). This might be heavy.
    // Optimization: We could debounce this or rely on the parent's throttle.
    // Ideally we only update grid when satellites move significantly, but for now strict reactivity is required.
    const gridRectangles = useMemo(() => {
        if (!show) return [];
        return generateCoverageGrid(satellites, satelliteScope);
    }, [satellites, satelliteScope, show]);

    if (!show || satelliteScope === 'ALL') {
        return null;
    }

    return (
        <>
            {gridRectangles.map((rect, index) => (
                <Entity key={`grid-${index}`}>
                    <RectangleGraphics
                        coordinates={rect}
                        material={satelliteScope === 'LEO'
                            ? Color.DEEPPINK.withAlpha(0.25)
                            : (satelliteScope === 'GEO' ? Color.ROYALBLUE.withAlpha(0.25) : Color.TEAL.withAlpha(0.25))}
                        outline={false}
                        height={1000} // Clamp to ground
                    />
                </Entity>
            ))}
        </>
    );
};

export default React.memo(AggregatedConnectivityLayer);
