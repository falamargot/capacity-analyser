/**
 * CoverageLayer - Renders coverage polygons for satellites
 */
import React, { useMemo } from 'react';
import { Entity, PolygonGraphics } from 'resium';
import { Cartesian3, Color } from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import type { CandidateCoverage } from '../../types/analysis';
import { getCoverageColor } from '../../services/coverageService';
import { getCandidateCoverageKey, getFeatureCandidateCoverageKey } from '../../utils/geoCoverageSelection';

const SELECTED_GEO_CONTOUR_HEIGHT_M = 10000;
const SELECTED_GEO_CONTOUR_COLOR = Color.fromCssColorString('#2563eb').withAlpha(0.98);
const GEO_CONTOUR_COLOR = Color.fromCssColorString('#60a5fa').withAlpha(0.9);

interface CoverageLayerProps {
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    candidateCoverages?: CandidateCoverage[];
    selectedCoverage?: CandidateCoverage | null;
}

const buildClosedRing = (ring: number[][]): number[][] => {
    if (ring.length < 2) return ring;
    const [firstLng, firstLat] = ring[0];
    const [lastLng, lastLat] = ring[ring.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) return ring;
    return [...ring, ring[0]];
};

const CoveragePolygon = React.memo<{
    feature: Feature<Geometry, GeoJsonProperties>;
    index: number;
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    geoLayerIndex: number | null;
    geoLayerCount: number;
    isCandidate: boolean;
    isSelected: boolean;
}>(({ feature, index, satelliteTypeByName, geoLayerIndex, geoLayerCount, isCandidate, isSelected }) => {
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
    const satType = typeof satName === 'string' ? satelliteTypeByName.get(satName) : undefined;
    const isGeoCoverage = satType === 'EUTELSAT' || feature.properties?.type === 'EUTELSAT';

    const color = useMemo(() => {
        if (!isPolygon || isOneWebPlaceholder) return null;
        const geoAlpha = (() => {
            if (!isGeoCoverage) return 0.4;
            if (isSelected) return 0.52;
            if (isCandidate) return 0.26;
            if (geoLayerIndex == null || geoLayerCount <= 1) return 0.2;

            // GEO readability: light fill, progressively denser toward inner/smaller layers.
            const t = geoLayerIndex / Math.max(geoLayerCount - 1, 1);
            return 0.12 + (0.32 - 0.12) * t;
        })();

        const colorHex = getCoverageColor(feature.properties?.type, geoAlpha);
        return Color.fromCssColorString(colorHex);
    }, [
        feature.properties?.type,
        isPolygon,
        isOneWebPlaceholder,
        isGeoCoverage,
        isCandidate,
        isSelected,
        geoLayerIndex,
        geoLayerCount,
    ]);

    const outlineColor = useMemo(() => {
        if (!isGeoCoverage) return null;
        if (isSelected) return SELECTED_GEO_CONTOUR_COLOR;
        if (isCandidate) return GEO_CONTOUR_COLOR;
        return GEO_CONTOUR_COLOR;
    }, [isCandidate, isGeoCoverage, isSelected, geoLayerIndex, geoLayerCount]);

    if (!isPolygon || isOneWebPlaceholder || !hierarchy || !color) return null;

    return (
        <>
            <Entity key={`coverage-${index}`} name={feature.properties?.name}>
                <PolygonGraphics
                    hierarchy={hierarchy}
                    material={color}
                    outline={!!outlineColor && !isSelected}
                    outlineColor={!isSelected ? (outlineColor || undefined) : undefined}
                    outlineWidth={1}
                />
            </Entity>
            {isGeoCoverage && outlineColor && !isSelected && (
                <Entity
                    key={`coverage-outline-${index}`}
                    name={`${feature.properties?.name || 'GEO Coverage'} contour`}
                    polyline={{
                        positions: (() => {
                            try {
                                const ring = coords as number[][];
                                if (!ring || ring.length < 2) return undefined;
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
                                return undefined;
                            }
                        })(),
                        width: isCandidate ? 1.5 : 1,
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
    satelliteTypeByName,
    candidateCoverages = [],
    selectedCoverage = null,
}) => {
    const selectedCoverageKey = useMemo(() => (
        selectedCoverage ? getCandidateCoverageKey(selectedCoverage) : null
    ), [selectedCoverage]);

    const selectedGeoRendering = useMemo(() => {
        if (!selectedCoverage) return null;

        const selectedFeature = coverageFeatures.find((feature) => (
            getFeatureCandidateCoverageKey(feature) === selectedCoverageKey &&
            feature.geometry.type === 'Polygon'
        ));

        if (!selectedFeature || selectedFeature.geometry.type !== 'Polygon') {
            return null;
        }

        const ring = selectedFeature.geometry.coordinates[0] as number[][];
        if (!ring || ring.length < 2) return null;

        const closed = buildClosedRing(ring);
        const polygonDegrees: number[] = [];
        const contourDegrees: number[] = [];
        for (const [lng, lat] of closed) {
            polygonDegrees.push(lng, lat);
            contourDegrees.push(lng, lat, SELECTED_GEO_CONTOUR_HEIGHT_M);
        }

        const fillColor = Color.fromCssColorString(
            getCoverageColor(selectedFeature.properties?.type, 0.52)
        );

        return {
            key: selectedCoverageKey,
            hierarchy: Cartesian3.fromDegreesArray(polygonDegrees),
            contourPositions: Cartesian3.fromDegreesArrayHeights(contourDegrees),
            fillColor,
        };
    }, [coverageFeatures, selectedCoverage, selectedCoverageKey]);

    const coverageEntities = useMemo(() => {
        const candidateCoverageKeys = new Set(
            candidateCoverages.map((candidate) => getCandidateCoverageKey(candidate))
        );
        const isGeoFeature = (feature: Feature<Geometry, GeoJsonProperties>): boolean => {
            if (feature.properties?.type === 'EUTELSAT') return true;
            const satName = feature.properties?.satelliteId as string | undefined;
            if (!satName) return false;
            return satelliteTypeByName.get(satName) === 'EUTELSAT';
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
            if (selectedCoverageKey && getFeatureCandidateCoverageKey(feature) === selectedCoverageKey) return false;
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
            const featureKey = getFeatureCandidateCoverageKey(feature);
            return (
                <CoveragePolygon
                    key={`coverage-${index}`}
                    feature={feature}
                    index={index}
                    satelliteTypeByName={satelliteTypeByName}
                    geoLayerIndex={geoLayerIndex}
                    geoLayerCount={geoLayerCount}
                    isCandidate={featureKey !== null && candidateCoverageKeys.has(featureKey)}
                    isSelected={featureKey !== null && featureKey === selectedCoverageKey}
                />
            );
        });
    }, [candidateCoverages, coverageFeatures, satelliteTypeByName, selectedCoverageKey]);

    return (
        <>
            {coverageEntities}
            {selectedGeoRendering && (
                <>
                    <Entity
                        key={`selected-geo-polygon-${selectedGeoRendering.key}`}
                        name="Selected GEO Coverage"
                    >
                        <PolygonGraphics
                            hierarchy={selectedGeoRendering.hierarchy}
                            material={selectedGeoRendering.fillColor}
                            outline={false}
                        />
                    </Entity>
                    <Entity
                        key={`selected-geo-contour-${selectedGeoRendering.key}`}
                        name="Selected GEO Coverage contour"
                        polyline={{
                            positions: selectedGeoRendering.contourPositions,
                            width: 2,
                            material: SELECTED_GEO_CONTOUR_COLOR,
                            depthFailMaterial: SELECTED_GEO_CONTOUR_COLOR,
                            clampToGround: false,
                        }}
                    />
                </>
            )}
        </>
    );
};

export default React.memo(CoverageLayer);
