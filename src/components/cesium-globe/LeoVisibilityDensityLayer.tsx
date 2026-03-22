/**
 * LeoVisibilityDensityLayer — polar coverage density heatmap.
 *
 * Shows the number of OneWeb satellites simultaneously above STANDARD_ELEVATION_DEG (55°)
 * from each point on the globe.  Walker-Star at 87.9° inclination produces a markedly
 * higher density at high latitudes — this layer makes that physically visible.
 *
 * Implementation:
 *   - 10° × 10° grid (36 × 18 = 648 cells)
 *   - For each cell centre, counts ONEWEB sats with elevation ≥ 55°
 *   - Color-coded by count: 0=transparent, 1=light, 2=medium, 3+=bright
 *   - Recomputed every 60 s to track constellation movement
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Entity, PolygonGraphics } from 'resium';
import { Color, PolygonHierarchy, Cartesian3 } from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import { calculateElevationAngle } from '../../utils/capacityCalculator';
import { STANDARD_ELEVATION_DEG } from '../../utils/leoFootprint';
import { FOOTPRINT_LAYER_HEIGHT_M } from './layerHeights';

const GRID_STEP_DEG = 10;
const UPDATE_INTERVAL_MS = 60_000;

/** Cesium colors by satellite count (0 = transparent, trimmed at 4+) */
const COUNT_COLORS: Color[] = [
    Color.TRANSPARENT,
    Color.fromCssColorString('#bfdbfe').withAlpha(0.22), // 1 sat — light blue
    Color.fromCssColorString('#60a5fa').withAlpha(0.32), // 2 sats — medium blue
    Color.fromCssColorString('#2563eb').withAlpha(0.42), // 3 sats — strong blue
    Color.fromCssColorString('#1e3a8a').withAlpha(0.55), // 4+ sats — deep blue
];

function getColor(count: number): Color {
    return COUNT_COLORS[Math.min(count, COUNT_COLORS.length - 1)];
}

function buildCellHierarchy(lat: number, lng: number, step: number): PolygonHierarchy {
    const half = step / 2;
    const latMin = Math.max(-90, lat - half);
    const latMax = Math.min(90, lat + half);
    const lngMin = lng - half;
    const lngMax = lng + half;
    return new PolygonHierarchy(
        Cartesian3.fromDegreesArray([
            lngMin, latMin,
            lngMax, latMin,
            lngMax, latMax,
            lngMin, latMax,
        ])
    );
}

interface DensityCell {
    id: string;
    hierarchy: PolygonHierarchy;
    count: number;
}

function computeGrid(onewebSats: SatelliteData[]): DensityCell[] {
    const cells: DensityCell[] = [];
    for (let lat = -85; lat <= 85; lat += GRID_STEP_DEG) {
        for (let lng = -180; lng < 180; lng += GRID_STEP_DEG) {
            const point = { lat, lng };
            let count = 0;
            for (const sat of onewebSats) {
                if (calculateElevationAngle(point, sat) >= STANDARD_ELEVATION_DEG) {
                    count++;
                }
            }
            if (count > 0) {
                cells.push({
                    id: `density-${lat}-${lng}`,
                    hierarchy: buildCellHierarchy(lat, lng, GRID_STEP_DEG),
                    count,
                });
            }
        }
    }
    return cells;
}

interface LeoVisibilityDensityLayerProps {
    satellites: SatelliteData[];
    show: boolean;
}

const LeoVisibilityDensityLayer: React.FC<LeoVisibilityDensityLayerProps> = ({ satellites, show }) => {
    const onewebSats = useMemo(
        () => satellites.filter(s => s.type === 'ONEWEB'),
        [satellites]
    );

    const [cells, setCells] = useState<DensityCell[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!show || onewebSats.length === 0) {
            setCells([]);
            return;
        }

        // Initial compute
        setCells(computeGrid(onewebSats));

        // Periodic refresh (satellites move ~0.07°/s — 60 s gives ~4° of orbital travel)
        timerRef.current = setInterval(() => {
            setCells(computeGrid(onewebSats));
        }, UPDATE_INTERVAL_MS);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [show, onewebSats]);

    if (!show || cells.length === 0) return null;

    return (
        <>
            {cells.map(cell => (
                <Entity key={cell.id} name={cell.id}>
                    <PolygonGraphics
                        hierarchy={cell.hierarchy}
                        material={getColor(cell.count)}
                        outline={false}
                        height={FOOTPRINT_LAYER_HEIGHT_M - 200}
                    />
                </Entity>
            ))}
        </>
    );
};

export default React.memo(LeoVisibilityDensityLayer);
