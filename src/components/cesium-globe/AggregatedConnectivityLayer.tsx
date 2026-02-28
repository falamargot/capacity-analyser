import React, { useMemo } from 'react';
import { Entity, RectangleGraphics, PolylineGraphics } from 'resium';
import {
    Color,
    Cartesian3,
    ArcType,
    PolylineDashMaterialProperty
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { generateCoverageGrid } from './utils/gridCoverage';
import { useSimulation } from '../../contexts/SimulationContext';
import { getPosition, propagateSatellite } from './utils';
import { JulianDate } from 'cesium';

interface AggregatedConnectivityLayerProps {
    satelliteScope: SatelliteScope;
    satellites: SatelliteData[];
    show: boolean;
}

// Stable dashed material for backhaul links (salmon/pink to match LEO style)
const backhaulMaterial = new PolylineDashMaterialProperty({
    color: Color.PALEVIOLETRED.withAlpha(0.7),
    dashPattern: 3855
});

const AggregatedConnectivityLayer: React.FC<AggregatedConnectivityLayerProps> = ({
    satelliteScope,
    satellites,
    show
}) => {
    const { coveragePolicy } = useSimulation();

    // Generate the binary coverage grid + backhaul links
    // Memoized to avoid re-calculation on every frame, only when satellites move/update
    const { gridRectangles, backhaulLinks } = useMemo(() => {
        if (!show || satelliteScope === 'ALL') return { gridRectangles: [], backhaulLinks: [] };
        const result = generateCoverageGrid(satellites, satelliteScope, coveragePolicy);
        return { gridRectangles: result.rectangles, backhaulLinks: result.backhaulLinks };
    }, [satellites, satelliteScope, show, coveragePolicy]);

    if (!show || satelliteScope === 'ALL') {
        return null;
    }

    const now = JulianDate.now();
    const coverageColor = satelliteScope === 'LEO'
        ? Color.DEEPPINK.withAlpha(0.25)
        : (satelliteScope === 'GEO' ? Color.ROYALBLUE.withAlpha(0.25) : Color.TEAL.withAlpha(0.25));

    return (
        <>
            {/* Coverage grid rectangles */}
            {gridRectangles.map((rect, index) => (
                <Entity key={`grid-${index}`}>
                    <RectangleGraphics
                        coordinates={rect}
                        material={coverageColor}
                        outline={false}
                        height={1000}
                    />
                </Entity>
            ))}

            {/* Backhaul links: Satellite → SNP (only shown in LEO scope) */}
            {satelliteScope === 'LEO' && backhaulLinks.map((link, index) => {
                // Propagate live satellite position for the backhaul link
                const satPos = propagateSatellite(link.satellite, now);
                const snpPos = getPosition(link.snp.lat, link.snp.lng, 0.01);

                // Skip if positions are invalid (fallback to origin)
                if (Cartesian3.equals(satPos, Cartesian3.ZERO) || Cartesian3.equals(snpPos, Cartesian3.ZERO)) {
                    return null;
                }

                return (
                    <Entity key={`backhaul-${link.satellite.id}-${index}`} name={`${link.satellite.name} → ${link.snp.name}`}>
                        <PolylineGraphics
                            positions={[satPos, snpPos]}
                            width={1}
                            material={backhaulMaterial}
                            arcType={ArcType.NONE}
                            clampToGround={false}
                        />
                    </Entity>
                );
            })}
        </>
    );
};

export default React.memo(AggregatedConnectivityLayer);
