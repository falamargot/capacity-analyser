/**
 * CoverageLayer - Renders coverage polygons for satellites
 */
import React, { useMemo } from 'react';
import { Entity, PolygonGraphics } from 'resium';
import { Cartesian3, Color } from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import { getCoverageColor } from '../../services/coverageService';

interface CoverageLayerProps {
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    satellites: SatelliteData[];
}

const CoveragePolygon = React.memo<{
    feature: Feature<Geometry, GeoJsonProperties>;
    index: number;
    satellites: SatelliteData[];
    geoLayerIndex: number | null;
    geoLayerCount: number;
}>(({ feature, index, satellites, geoLayerIndex, geoLayerCount }) => {
    const isPolygon = feature.geometry.type === 'Polygon';
    const isOneWebPlaceholder = feature.properties?.type === 'ONEWEB_SWATH' || feature.properties?.type === 'ONEWEB_SERVICE_ZONE';

    const coords = isPolygon ? (feature.geometry.coordinates[0] as any) : null;

    const hierarchy = useMemo(() => {
        if (!coords) return null;
        try {
            return Cartesian3.fromDegreesArray(coords.flat() as number[]);
        } catch {
            return null;
        }
    }, [coords]);

    const satName = feature.properties?.satelliteId;
    const sat = satellites.find(s => s.name === satName);

    const isGeoCoverage = sat?.type === 'EUTELSAT' || feature.properties?.type === 'EUTELSAT';

    const outlinePositions = useMemo(() => {
        if (!coords || !isGeoCoverage) return null;
        try {
            const ring = coords as number[][];
            if (ring.length < 2) return null;

            // Ensure closed ring for visible contour loop.
            const closed = (() => {
                const [firstLng, firstLat] = ring[0];
                const [lastLng, lastLat] = ring[ring.length - 1];
                if (firstLng === lastLng && firstLat === lastLat) return ring;
                return [...ring, ring[0]];
            })();

            const arr: number[] = [];
            for (const [lng, lat] of closed) {
                arr.push(lng, lat);
            }
            return Cartesian3.fromDegreesArray(arr);
        } catch {
            return null;
        }
    }, [coords, isGeoCoverage]);

    const color = useMemo(() => {
        if (!isPolygon || isOneWebPlaceholder) return null;
        const geoAlpha = (() => {
            if (!isGeoCoverage) return 0.4;
            if (geoLayerIndex == null || geoLayerCount <= 1) return 0.2;

            // GEO readability: light fill, progressively denser toward inner/smaller layers.
            const t = geoLayerIndex / Math.max(geoLayerCount - 1, 1);
            return 0.12 + (0.32 - 0.12) * t;
        })();

        const colorHex = getCoverageColor(feature.properties?.type, geoAlpha, sat);
        return Color.fromCssColorString(colorHex);
    }, [
        feature.properties?.type,
        sat,
        isPolygon,
        isOneWebPlaceholder,
        isGeoCoverage,
        geoLayerIndex,
        geoLayerCount,
    ]);

    const outlineColor = useMemo(() => {
        if (!isGeoCoverage) return null;
        const t = geoLayerIndex == null || geoLayerCount <= 1
            ? 0.5
            : geoLayerIndex / Math.max(geoLayerCount - 1, 1);
        return Color.WHITE.withAlpha(0.7 + 0.3 * t);
    }, [isGeoCoverage, geoLayerIndex, geoLayerCount]);

    if (!isPolygon || isOneWebPlaceholder || !hierarchy || !color) return null;

    return (
        <>
            <Entity key={`coverage-${index}`} name={feature.properties?.name}>
                <PolygonGraphics
                    hierarchy={hierarchy}
                    material={color}
                    outline={!!outlineColor}
                    outlineColor={outlineColor || undefined}
                    outlineWidth={1}
                />
            </Entity>
            {isGeoCoverage && outlineColor && outlinePositions && (
                <Entity
                    key={`coverage-outline-${index}`}
                    name={`${feature.properties?.name || 'GEO Coverage'} contour`}
                    polyline={{
                        positions: outlinePositions,
                        width: 1,
                        material: outlineColor,
                        clampToGround: true,
                    }}
                />
            )}
        </>
    );
});

CoveragePolygon.displayName = 'CoveragePolygon';

const CoverageLayer: React.FC<CoverageLayerProps> = ({
    coverageFeatures,
    satellites
}) => {
    const coverageEntities = useMemo(() => {
        const satTypeByName = new Map(satellites.map((sat) => [sat.name, sat.type]));
        const isGeoFeature = (feature: Feature<Geometry, GeoJsonProperties>): boolean => {
            if (feature.properties?.type === 'EUTELSAT') return true;
            const satName = feature.properties?.satelliteId as string | undefined;
            if (!satName) return false;
            return satTypeByName.get(satName) === 'EUTELSAT';
        };
        const approximatePolygonArea = (feature: Feature<Geometry, GeoJsonProperties>): number => {
            if (feature.geometry.type !== 'Polygon') return 0;
            const ring = feature.geometry.coordinates[0] as number[][];
            if (!ring || ring.length < 3) return 0;

            // Ranking-only metric: planar shoelace in lon/lat space.
            let area = 0;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const [xi, yi] = ring[i];
                const [xj, yj] = ring[j];
                area += (xj + xi) * (yj - yi);
            }
            return Math.abs(area) * 0.5;
        };

        const filteredFeatures = coverageFeatures.filter((feature) => {
            // Filter out OneWeb comb placeholders and non-polygons
            if (feature.geometry.type !== 'Polygon') return false;
            if (feature.properties?.type === 'ONEWEB_SWATH') return false;
            if (feature.properties?.type === 'ONEWEB_SERVICE_ZONE') return false;
            return true;
        });

        const geoCandidates = filteredFeatures
            .map((feature, filteredIndex) => ({ feature, filteredIndex }))
            .filter(({ feature }) => isGeoFeature(feature))
            .map(({ feature, filteredIndex }) => ({
                filteredIndex,
                area: approximatePolygonArea(feature),
            }))
            .sort((a, b) => b.area - a.area); // large -> small

        const geoLayerCount = geoCandidates.length;
        const geoRankByFilteredIndex = new Map<number, number>();
        geoCandidates.forEach((candidate, rank) => {
            geoRankByFilteredIndex.set(candidate.filteredIndex, rank);
        });

        return filteredFeatures.map((feature, index) => {
            const geoLayerIndex = isGeoFeature(feature)
                ? (geoRankByFilteredIndex.get(index) ?? null)
                : null;
            return (
                <CoveragePolygon
                    key={`coverage-${index}`}
                    feature={feature}
                    index={index}
                    satellites={satellites}
                    geoLayerIndex={geoLayerIndex}
                    geoLayerCount={geoLayerCount}
                />
            );
        });
    }, [coverageFeatures, satellites]);

    return <>{coverageEntities}</>;
};

export default React.memo(CoverageLayer);
