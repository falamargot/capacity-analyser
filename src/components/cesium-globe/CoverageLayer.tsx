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
import {
    getCandidateBeamKey,
    getCandidateCoverageKey,
    getFeatureBeamCoverageKey,
    getFeatureCandidateCoverageKey,
} from '../../utils/geoCoverageSelection';
import {
    GEO_FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M,
    GEO_FOOTPRINT_LAYER_HEIGHT_M,
    GEO_FOOTPRINT_OUTLINE_LAYER_HEIGHT_M,
} from './layerHeights';

const SELECTED_GEO_CONTOUR_BASE_COLOR = Color.fromCssColorString('#2563eb');
const SELECTED_GEO_CONTOUR_COLOR = SELECTED_GEO_CONTOUR_BASE_COLOR.withAlpha(0.98);
const GEO_CONTOUR_COLOR = Color.fromCssColorString('#60a5fa').withAlpha(0.9);

interface CoverageLayerProps {
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    candidateCoverages?: CandidateCoverage[];
    selectedCoverage?: CandidateCoverage | null;
    selectedGeoBeamKey?: string | null;
    manualGeoSatelliteName?: string | null;
}

const normalizeSatelliteKey = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
};

const isFiniteLngLat = (value: unknown): value is [number, number] => (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
);

const sanitizeRing = (ring: unknown): number[][] | null => {
    if (!Array.isArray(ring)) return null;

    const sanitized = ring
        .filter(isFiniteLngLat)
        .map(([lng, lat]) => [lng, lat]);

    if (sanitized.length >= 2) {
        const [firstLng, firstLat] = sanitized[0];
        const [lastLng, lastLat] = sanitized[sanitized.length - 1];
        if (firstLng === lastLng && firstLat === lastLat) {
            sanitized.pop();
        }
    }

    if (sanitized.length < 3) return null;

    const uniqueCount = sanitized.reduce((count, [lng, lat], index) => (
        sanitized.slice(0, index).some(([candidateLng, candidateLat]) => candidateLng === lng && candidateLat === lat)
            ? count
            : count + 1
    ), 0);

    return uniqueCount >= 3 ? sanitized : null;
};

const buildClosedRing = (ring: number[][]): number[][] => {
    if (ring.length < 2) return ring;
    const [firstLng, firstLat] = ring[0];
    const [lastLng, lastLat] = ring[ring.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) return ring;
    return [...ring, ring[0]];
};

const getPolygonRing = (feature: Feature<Geometry, GeoJsonProperties>): number[][] | null => {
    const geometry = feature.geometry;
    if (!geometry || geometry.type !== 'Polygon') return null;

    return sanitizeRing(geometry.coordinates?.[0]);
};

const CoveragePolygon = React.memo<{
    feature: Feature<Geometry, GeoJsonProperties>;
    index: number;
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    geoLayerIndex: number | null;
    geoLayerCount: number;
    isCandidate: boolean;
    isSelected: boolean;
    isManualGeoOverview: boolean;
}>(({ feature, index, satelliteTypeByName, geoLayerIndex, geoLayerCount, isCandidate, isSelected, isManualGeoOverview }) => {
    const isOneWebPlaceholder = feature.properties?.type === 'ONEWEB_SWATH' || feature.properties?.type === 'ONEWEB_SERVICE_ZONE';
    const coords = useMemo(() => getPolygonRing(feature), [feature]);
    const isPolygon = coords !== null;

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
            if (isSelected) return 0.16;
            if (isManualGeoOverview) {
                return 0.0;
            }
            if (isCandidate) return 0.0;
            if (geoLayerIndex == null || geoLayerCount <= 1) return 0.0;
            return 0.00;
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
        isManualGeoOverview,
        geoLayerIndex,
        geoLayerCount,
    ]);

    // geoLayerIndex / geoLayerCount are NOT used in this computation — removed from deps
    // to avoid spurious re-runs when the layer order changes but the color doesn't.
    const outlineColor = useMemo(() => {
        if (!isGeoCoverage) return null;
        if (isSelected) return SELECTED_GEO_CONTOUR_COLOR;
        return GEO_CONTOUR_COLOR;
    }, [isGeoCoverage, isSelected]);

    // Memoize polyline positions so Cartesian3.fromDegreesArray is NOT called on
    // every render — only when the coordinate ring changes (i.e. on initial load).
    // Previously this was an inline IIFE that allocated a flat number[] + a
    // Cartesian3[] on every single render for every GEO contour polygon.
    const polylinePositions = useMemo(() => {
        if (!isGeoCoverage || !outlineColor || isSelected) return undefined;
        try {
            const ring = coords as number[][] | null;
            if (!ring || ring.length < 2) return undefined;
            const closed = buildClosedRing(ring);
            const arr: number[] = [];
            for (const [lng, lat] of closed) {
                arr.push(lng, lat, GEO_FOOTPRINT_OUTLINE_LAYER_HEIGHT_M);
            }
            return Cartesian3.fromDegreesArrayHeights(arr);
        } catch {
            return undefined;
        }
    }, [coords, isGeoCoverage, isSelected, outlineColor]);

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
                    height={GEO_FOOTPRINT_LAYER_HEIGHT_M}
                />
            </Entity>
            {isGeoCoverage && outlineColor && !isSelected && polylinePositions && (
                <Entity
                    key={`coverage-outline-${index}`}
                    name={`${feature.properties?.name || 'GEO Coverage'} contour`}
                    polyline={{
                        positions: polylinePositions,
                        width: isCandidate ? 1.5 : 1,
                        material: outlineColor,
                        clampToGround: false,
                        depthFailMaterial: outlineColor,
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
    selectedGeoBeamKey = null,
    manualGeoSatelliteName = null,
}) => {
    const selectedBeamKey = useMemo(() => (
        selectedCoverage ? getCandidateBeamKey(selectedCoverage) : selectedGeoBeamKey
    ), [selectedCoverage, selectedGeoBeamKey]);
    const selectedCoverageGroupKey = useMemo(() => (
        selectedCoverage ? getCandidateCoverageKey(selectedCoverage) : null
    ), [selectedCoverage]);
    const normalizedManualGeoSatelliteName = useMemo(
        () => normalizeSatelliteKey(manualGeoSatelliteName),
        [manualGeoSatelliteName]
    );

    const selectedGeoState = useMemo(() => {
        if (!selectedBeamKey && !selectedCoverageGroupKey) {
            return {
                selectedFeatureSet: new Set<Feature<Geometry, GeoJsonProperties>>(),
                renderings: null as Array<{
                    key: string;
                    hierarchy: Cartesian3[];
                    contourPositions: Cartesian3[];
                    fillColor: Color;
                    contourColor: Color;
                    contourWidth: number;
                }> | null,
            };
        }

        const selectedFeatures = coverageFeatures.filter((feature) => {
            if (getPolygonRing(feature) === null) return false;

            if (selectedCoverageGroupKey) {
                return getFeatureCandidateCoverageKey(feature) === selectedCoverageGroupKey;
            }

            return getFeatureBeamCoverageKey(feature) === selectedBeamKey;
        });

        if (selectedFeatures.length === 0) {
            return {
                selectedFeatureSet: new Set<Feature<Geometry, GeoJsonProperties>>(),
                renderings: null,
            };
        }

        const approximatePolygonArea = (feature: Feature<Geometry, GeoJsonProperties>): number => {
            const ring = getPolygonRing(feature);
            if (!ring || ring.length < 3) return 0;

            let area = 0;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const [xi, yi] = ring[i];
                const [xj, yj] = ring[j];
                area += (xj + xi) * (yj - yi);
            }
            return Math.abs(area) * 0.5;
        };

        const rankedFeatures = [...selectedFeatures]
            .map((feature) => ({
                feature,
                area: approximatePolygonArea(feature),
                isPrimary: selectedBeamKey !== null && getFeatureBeamCoverageKey(feature) === selectedBeamKey,
            }))
            .sort((left, right) => right.area - left.area);

        const renderings = rankedFeatures
            .map(({ feature, isPrimary }, index) => {
                const ring = getPolygonRing(feature);
                if (!ring) return null;

                const closed = buildClosedRing(ring);
                const polygonDegrees: number[] = [];
                const contourDegrees: number[] = [];
                for (const [lng, lat] of closed) {
                    polygonDegrees.push(lng, lat);
                    contourDegrees.push(lng, lat, GEO_FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M);
                }

                const depth = rankedFeatures.length <= 1
                    ? 1
                    : 1 - (index / Math.max(rankedFeatures.length - 1, 1));
                const fillAlpha = isPrimary
                    ? 0.18
                    : 0.03 + (depth * 0.08);
                const contourAlpha = isPrimary
                    ? 0.98
                    : 0.28 + (depth * 0.42);
                const contourWidth = isPrimary ? 2.4 : 1 + (depth * 0.8);

                return {
                    key: `${selectedCoverageGroupKey ?? selectedBeamKey ?? 'selected'}-${index}`,
                    hierarchy: Cartesian3.fromDegreesArray(polygonDegrees),
                    contourPositions: Cartesian3.fromDegreesArrayHeights(contourDegrees),
                    fillColor: Color.fromCssColorString(
                        getCoverageColor(feature.properties?.type, fillAlpha)
                    ),
                    contourColor: SELECTED_GEO_CONTOUR_BASE_COLOR.withAlpha(contourAlpha),
                    contourWidth,
                };
            })
            .filter((entry): entry is {
                key: string;
                hierarchy: Cartesian3[];
                contourPositions: Cartesian3[];
                fillColor: Color;
                contourColor: Color;
                contourWidth: number;
            } => entry !== null);

        return {
            selectedFeatureSet: new Set(selectedFeatures),
            renderings,
        };
    }, [coverageFeatures, selectedBeamKey, selectedCoverageGroupKey]);

    const coverageEntities = useMemo(() => {
        const candidateBeamKeys = new Set(
            candidateCoverages.map((candidate) => getCandidateBeamKey(candidate))
        );
        const isGeoFeature = (feature: Feature<Geometry, GeoJsonProperties>): boolean => {
            if (feature.properties?.type === 'EUTELSAT') return true;
            const satName = feature.properties?.satelliteId as string | undefined;
            if (!satName) return false;
            return satelliteTypeByName.get(satName) === 'EUTELSAT';
        };
        const approximatePolygonArea = (feature: Feature<Geometry, GeoJsonProperties>): number => {
            const ring = getPolygonRing(feature);
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
            if (getPolygonRing(feature) === null) return false;
            if (feature.properties?.type === 'ONEWEB_SWATH') return false;
            if (feature.properties?.type === 'ONEWEB_SERVICE_ZONE') return false;
            if (selectedGeoState.selectedFeatureSet.has(feature)) return false;
            return true;
        });

        const geoLayersBySatellite = new Map<string, Array<{ filteredIndex: number; area: number }>>();
        filteredFeatures.forEach((feature, filteredIndex) => {
            if (!isGeoFeature(feature)) return;
            const satelliteKey = normalizeSatelliteKey(feature.properties?.satelliteId) ?? '__unknown__';
            const layers = geoLayersBySatellite.get(satelliteKey) ?? [];
            layers.push({
                filteredIndex,
                area: approximatePolygonArea(feature),
            });
            geoLayersBySatellite.set(satelliteKey, layers);
        });

        const geoLayerCountByFilteredIndex = new Map<number, number>();
        const geoRankByFilteredIndex = new Map<number, number>();
        geoLayersBySatellite.forEach((layers) => {
            layers
                .sort((a, b) => b.area - a.area)
                .forEach((layer, rank) => {
                    geoRankByFilteredIndex.set(layer.filteredIndex, rank);
                    geoLayerCountByFilteredIndex.set(layer.filteredIndex, layers.length);
                });
        });

        return filteredFeatures.map((feature, index) => {
            const featureSatelliteKey = normalizeSatelliteKey(feature.properties?.satelliteId);
            const geoLayerIndex = isGeoFeature(feature)
                ? (geoRankByFilteredIndex.get(index) ?? null)
                : null;
            const geoLayerCount = isGeoFeature(feature)
                ? (geoLayerCountByFilteredIndex.get(index) ?? 0)
                : 0;
            const featureBeamKey = getFeatureBeamCoverageKey(feature);
            const isManualGeoOverview = (
                normalizedManualGeoSatelliteName !== null &&
                selectedBeamKey === null &&
                featureSatelliteKey === normalizedManualGeoSatelliteName &&
                isGeoFeature(feature)
            );
            return (
                <CoveragePolygon
                    key={`coverage-${index}`}
                    feature={feature}
                    index={index}
                    satelliteTypeByName={satelliteTypeByName}
                    geoLayerIndex={geoLayerIndex}
                    geoLayerCount={geoLayerCount}
                    isCandidate={featureBeamKey !== null && candidateBeamKeys.has(featureBeamKey)}
                    isSelected={featureBeamKey !== null && featureBeamKey === selectedBeamKey}
                    isManualGeoOverview={isManualGeoOverview}
                />
            );
        });
    }, [candidateCoverages, coverageFeatures, normalizedManualGeoSatelliteName, satelliteTypeByName, selectedBeamKey, selectedGeoState.selectedFeatureSet]);

    return (
        <>
            {coverageEntities}
            {selectedGeoState.renderings?.map((rendering) => (
                <React.Fragment key={rendering.key}>
                    <Entity
                        key={`selected-geo-polygon-${rendering.key}`}
                        name="Selected GEO Coverage"
                    >
                        <PolygonGraphics
                            hierarchy={rendering.hierarchy}
                            material={rendering.fillColor}
                            outline={false}
                            height={GEO_FOOTPRINT_LAYER_HEIGHT_M}
                        />
                    </Entity>
                    <Entity
                        key={`selected-geo-contour-${rendering.key}`}
                        name="Selected GEO Coverage contour"
                        polyline={{
                            positions: rendering.contourPositions,
                            width: rendering.contourWidth,
                            material: rendering.contourColor,
                            depthFailMaterial: rendering.contourColor,
                            clampToGround: false,
                        }}
                    />
                </React.Fragment>
            ))}
        </>
    );
};

export default React.memo(CoverageLayer);
