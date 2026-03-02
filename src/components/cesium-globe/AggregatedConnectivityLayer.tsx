import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Entity, RectangleGraphics, PolylineGraphics } from 'resium';
import {
    Color,
    Cartesian3,
    ArcType,
    PolylineDashMaterialProperty,
    JulianDate
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { generateCoverageGrid } from './utils/gridCoverage';
import { useSimulation } from '../../contexts/SimulationContext';
import { getPosition, propagateSatellite } from './utils';

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

    // ── Throttled satellite snapshot (every 5s) ─────────────────────────────────
    // Instead of the removed module-level TTL cache, we take a 5s snapshot of
    // satellite positions inside the component. This:
    //   1. Ensures the grid and the App.tsx resolution run on the SAME JulianDate
    //      (both derive from Date.now() at the same 5s tick — no temporal desync)
    //   2. Avoids re-running the full grid computation on every 2s satellite update
    //   3. Keeps temporal error ≤ 35 km (5s × 7 km/s) which is within the 0.5°
    //      grid cell size (~55 km) — grid and resolution stay consistent
    //
    // Bug fix: the previous M-06 TTL cache (15s, module-level) was the primary cause
    // of the "pink grid shows coverage but panel shows 0 Mbps" inconsistency: it
    // served grid data computed at T while the user interacted at T+15s (105 km later).
    const GRID_INTERVAL_MS = 5_000;
    const [gridSnapshot, setGridSnapshot] = useState<{ satellites: SatelliteData[]; time: JulianDate } | null>(null);
    const lastGridTimeRef = useRef<number>(0);

    useEffect(() => {
        if (!show || satelliteScope === 'ALL') return;

        const update = () => {
            const now = Date.now();
            if (now - lastGridTimeRef.current >= GRID_INTERVAL_MS) {
                lastGridTimeRef.current = now;
                // Capture satellites + synchronized JulianDate atomically
                setGridSnapshot({ satellites, time: JulianDate.fromDate(new Date()) });
            }
        };

        // Run immediately on mount / show / scope change
        update();

        const interval = setInterval(update, GRID_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [satellites, satelliteScope, show]); // satellites in deps so initial snapshot is current

    const { gridRectangles, backhaulPositions } = useMemo(() => {
        if (!show || satelliteScope === 'ALL' || !gridSnapshot) {
            return { gridRectangles: [], backhaulPositions: [] };
        }

        // Use the snapshot's JulianDate — same time reference that App.tsx §1.3 resolution
        // would use for resolveAutoSelectedSatellites at the same tick.
        const result = generateCoverageGrid(
            gridSnapshot.satellites,
            satelliteScope,
            coveragePolicy,
            gridSnapshot.time  // synchronized time — eliminates grid/panel temporal desync
        );

        const backhaulPositions = result.backhaulLinks.map(link => ({
            satPos: propagateSatellite(link.satellite, gridSnapshot.time),
            snpPos: getPosition(link.snp.lat, link.snp.lng, 0.01),
            satId: link.satellite.id,
            snpName: link.snp.name,
            satName: link.satellite.name,
        }));

        return { gridRectangles: result.rectangles, backhaulPositions };
    }, [gridSnapshot, satelliteScope, show, coveragePolicy]);

    // M-05 fix: memoize coverageColor — only depends on scope, not on satellites
    const coverageColor = useMemo(() =>
        satelliteScope === 'LEO'
            ? Color.DEEPPINK.withAlpha(0.25)
            : (satelliteScope === 'GEO' ? Color.ROYALBLUE.withAlpha(0.25) : Color.TEAL.withAlpha(0.25)),
        [satelliteScope]
    );

    if (!show || satelliteScope === 'ALL') {
        return null;
    }

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
            {satelliteScope === 'LEO' && backhaulPositions.map((pos) => {
                // m-06 fix: stable key using satellite ID + SNP name (no index)
                // Skip if positions are invalid (fallback to origin)
                if (Cartesian3.equals(pos.satPos, Cartesian3.ZERO) || Cartesian3.equals(pos.snpPos, Cartesian3.ZERO)) {
                    return null;
                }

                return (
                    <Entity key={`backhaul-${pos.satId}-${pos.snpName}`} name={`${pos.satName} → ${pos.snpName}`}>
                        <PolylineGraphics
                            positions={[pos.satPos, pos.snpPos]}
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