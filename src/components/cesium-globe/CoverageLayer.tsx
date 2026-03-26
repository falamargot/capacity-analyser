/**
 * CoverageLayer - Renders coverage polygons for satellites
 */
import React, { useMemo } from 'react';
import { Entity, PolygonGraphics } from 'resium';
import { ArcType, Cartesian3, Color, PolygonHierarchy } from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import type { CandidateCoverage } from '../../types/analysis';
import { getCoverageColor } from '../../services/coverageService';
import { densifyRingForGlobe } from '../../utils/coverageGeometry';
import { isPointInPolygon } from '../../utils/geoUtils';
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
const SELECTED_GEO_FILL_OUTER_COLOR = Color.fromCssColorString('#93c5fd');
const SELECTED_GEO_FILL_INNER_COLOR = Color.fromCssColorString('#3b82f6');

interface GeoBandStyle {
    fillColor: Color;
    contourColor: Color;
    contourWidth: number;
}

const getGeoBandStyle = (
    normalizedBand: number,
    emphasis: 'default' | 'selected'
): GeoBandStyle => {
    const clampedBand = Math.max(0, Math.min(1, normalizedBand));
    const fillColor = Color.lerp(
        SELECTED_GEO_FILL_OUTER_COLOR,
        SELECTED_GEO_FILL_INNER_COLOR,
        0.14 + (clampedBand * 0.86),
        new Color()
    );

    fillColor.alpha = emphasis === 'selected'
        ? 0.085 + (clampedBand * 0.17)
        : 0.045 + (clampedBand * 0.095);

    return {
        fillColor,
        contourColor: SELECTED_GEO_CONTOUR_BASE_COLOR.withAlpha(
            emphasis === 'selected'
                ? 0.92
                : 0.52 + (clampedBand * 0.16)
        ),
        contourWidth: 1.6,
    };
};

interface CoverageLayerProps {
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    candidateCoverages?: CandidateCoverage[];
    selectedCoverage?: CandidateCoverage | null;
    selectedGeoCoverageName?: string | null;
    selectedGeoBeamKey?: string | null;
    manualGeoSatelliteName?: string | null;
}

interface SanitizedPolygonGeometry {
    outerRing: number[][];
    holes: number[][][];
}

interface ParsedSelectedFeature {
    feature: Feature<Geometry, GeoJsonProperties>;
    geometry: SanitizedPolygonGeometry;
    area: number;
    contourKey: string;
    parentIndex: number | null;
    directChildIndexes: number[];
    depth: number;
    contourLevel: number;
    isPrimary: boolean;
}

interface SelectedGeoRendering {
    key: string;
    hierarchy: PolygonHierarchy;
    contourPositions: Cartesian3[][];
    fillColor: Color;
    contourColor: Color;
    contourWidth: number;
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

const getSignedRingArea = (ring: number[][]): number => {
    if (ring.length < 3) return 0;

    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        area += (xj + xi) * (yj - yi);
    }

    return area * 0.5;
};

const normalizeRingAreaSign = (ring: number[][], wantPositiveArea: boolean): number[][] => {
    const signedArea = getSignedRingArea(ring);
    if (signedArea === 0) return ring;

    const hasPositiveArea = signedArea > 0;
    return hasPositiveArea === wantPositiveArea ? ring : [...ring].reverse();
};

const buildClosedRing = (ring: number[][]): number[][] => {
    if (ring.length < 2) return ring;
    const [firstLng, firstLat] = ring[0];
    const [lastLng, lastLat] = ring[ring.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) return ring;
    return [...ring, ring[0]];
};

const getSanitizedPolygonGeometry = (
    feature: Feature<Geometry, GeoJsonProperties>
): SanitizedPolygonGeometry | null => {
    const geometry = feature.geometry;
    if (!geometry || geometry.type !== 'Polygon') return null;

    const [outerRing, ...holeRings] = geometry.coordinates ?? [];
    const sanitizedOuterRing = sanitizeRing(outerRing);
    if (!sanitizedOuterRing) return null;

    const normalizedOuterRing = normalizeRingAreaSign(sanitizedOuterRing, true);

    return {
        outerRing: normalizedOuterRing,
        holes: holeRings
            .map((ring) => sanitizeRing(ring))
            .map((ring) => (ring ? normalizeRingAreaSign(ring, false) : null))
            .filter((ring): ring is number[][] => ring !== null),
    };
};

const approximateRingArea = (ring: number[][]): number => {
    return Math.abs(getSignedRingArea(ring));
};

const getRingCentroid = (ring: number[][]): { lng: number; lat: number } => {
    if (ring.length < 3) {
        const [lng = 0, lat = 0] = ring[0] ?? [];
        return { lng, lat };
    }

    let twiceArea = 0;
    let centroidLng = 0;
    let centroidLat = 0;

    for (let i = 0; i < ring.length; i += 1) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        const cross = x1 * y2 - x2 * y1;
        twiceArea += cross;
        centroidLng += (x1 + x2) * cross;
        centroidLat += (y1 + y2) * cross;
    }

    if (Math.abs(twiceArea) < 1e-8) {
        const [lngSum, latSum] = ring.reduce<[number, number]>(
            (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
            [0, 0]
        );
        return {
            lng: lngSum / ring.length,
            lat: latSum / ring.length,
        };
    }

    return {
        lng: centroidLng / (3 * twiceArea),
        lat: centroidLat / (3 * twiceArea),
    };
};

const getRepresentativePoint = (ring: number[][]): { lng: number; lat: number } => {
    const centroid = getRingCentroid(ring);
    const [anchorLng, anchorLat] = ring[0] ?? [centroid.lng, centroid.lat];

    return {
        lng: anchorLng + ((centroid.lng - anchorLng) * 0.001),
        lat: anchorLat + ((centroid.lat - anchorLat) * 0.001),
    };
};

const containsPointInPolygonGeometry = (
    geometry: SanitizedPolygonGeometry,
    point: { lng: number; lat: number }
): boolean => {
    if (!isPointInPolygon({ lat: point.lat, lng: point.lng }, geometry.outerRing)) {
        return false;
    }

    return !geometry.holes.some((holeRing) => (
        isPointInPolygon({ lat: point.lat, lng: point.lng }, holeRing)
    ));
};

const buildPolygonHierarchy = (
    geometry: SanitizedPolygonGeometry,
    directChildGeometries: SanitizedPolygonGeometry[] = []
): PolygonHierarchy | null => {
    try {
        const densifiedOuterRing = densifyRingForGlobe(geometry.outerRing);
        return new PolygonHierarchy(
            Cartesian3.fromDegreesArray(densifiedOuterRing.flat() as number[]),
            [
                ...geometry.holes.map((ring) => (
                    new PolygonHierarchy(
                        Cartesian3.fromDegreesArray(densifyRingForGlobe(ring).flat() as number[])
                    )
                )),
                ...directChildGeometries.map((childGeometry) => (
                    new PolygonHierarchy(
                        Cartesian3.fromDegreesArray(
                            densifyRingForGlobe(childGeometry.outerRing).flat() as number[]
                        )
                    )
                )),
            ]
        );
    } catch {
        return null;
    }
};

const buildContourPositions = (ring: number[][], height: number): Cartesian3[] | null => {
    try {
        const closed = buildClosedRing(densifyRingForGlobe(ring));
        const degrees: number[] = [];
        for (const [lng, lat] of closed) {
            degrees.push(lng, lat, height);
        }
        return Cartesian3.fromDegreesArrayHeights(degrees);
    } catch {
        return null;
    }
};

const getContourKey = (feature: Feature<Geometry, GeoJsonProperties>): string => {
    const contourValue = feature.properties?.contour;
    if (typeof contourValue === 'string' || typeof contourValue === 'number') {
        const normalized = String(contourValue).trim();
        if (normalized.length > 0) return normalized;
    }

    const nameValue = feature.properties?.name;
    if (typeof nameValue === 'string') {
        const normalized = nameValue.trim();
        if (normalized.length > 0) return normalized;
    }

    return 'unknown';
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
    const geometry = useMemo(() => getSanitizedPolygonGeometry(feature), [feature]);
    const isPolygon = geometry !== null;

    const hierarchy = useMemo(() => {
        if (!geometry) return null;
        return buildPolygonHierarchy(geometry);
    }, [geometry]);

    const satName = feature.properties?.satelliteId;
    const satType = typeof satName === 'string' ? satelliteTypeByName.get(satName) : undefined;
    const isGeoCoverage = satType === 'EUTELSAT' || feature.properties?.type === 'EUTELSAT';

    const color = useMemo(() => {
        if (!isPolygon || isOneWebPlaceholder) return null;
        if (isGeoCoverage) {
            const normalizedBand = geoLayerCount <= 1 || geoLayerIndex == null
                ? 1
                : (geoLayerCount - 1 - geoLayerIndex) / Math.max(geoLayerCount - 1, 1);
            return getGeoBandStyle(normalizedBand, isSelected ? 'selected' : 'default').fillColor;
        }

        const geoAlpha = (() => {
            if (!isGeoCoverage) return 0.4;
            if (isSelected) return 0.16;
            if (isManualGeoOverview) return 0.12;
            if (isCandidate) return 0.0;
            if (geoLayerIndex == null || geoLayerCount <= 1) return 0.0;
            return 0.0;
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

    const outlineColor = useMemo(() => {
        if (!isGeoCoverage) return null;
        const normalizedBand = geoLayerCount <= 1 || geoLayerIndex == null
            ? 1
            : (geoLayerCount - 1 - geoLayerIndex) / Math.max(geoLayerCount - 1, 1);
        return getGeoBandStyle(normalizedBand, isSelected ? 'selected' : 'default').contourColor;
    }, [geoLayerCount, geoLayerIndex, isGeoCoverage, isSelected]);

    const polylinePositions = useMemo(() => {
        if (!isGeoCoverage || !outlineColor || !geometry) return undefined;
        return buildContourPositions(geometry.outerRing, GEO_FOOTPRINT_OUTLINE_LAYER_HEIGHT_M) ?? undefined;
    }, [geometry, isGeoCoverage, outlineColor]);

    if (!isPolygon || isOneWebPlaceholder || !hierarchy || !color) return null;

    return (
        <>
            <Entity key={`coverage-${index}`} name={feature.properties?.name}>
                <PolygonGraphics
                    hierarchy={hierarchy}
                    material={color}
                    arcType={ArcType.RHUMB}
                    outline={!!outlineColor}
                    outlineColor={outlineColor || undefined}
                    outlineWidth={1}
                    height={GEO_FOOTPRINT_LAYER_HEIGHT_M}
                />
            </Entity>
            {isGeoCoverage && outlineColor && polylinePositions && (
                <Entity
                    key={`coverage-outline-${index}`}
                    name={`${feature.properties?.name || 'GEO Coverage'} contour`}
                    polyline={{
                        positions: polylinePositions,
                        width: isSelected || isCandidate ? 1.5 : 1,
                        material: outlineColor,
                        arcType: ArcType.RHUMB,
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
    selectedGeoCoverageName = null,
    selectedGeoBeamKey = null,
    manualGeoSatelliteName = null,
}) => {
    const selectedBeamKey = useMemo(() => (
        selectedGeoBeamKey ?? (selectedCoverage ? getCandidateBeamKey(selectedCoverage) : null)
    ), [selectedCoverage, selectedGeoBeamKey]);
    const selectedCoverageGroupKey = useMemo(() => (
        selectedGeoCoverageName ?? (selectedCoverage ? getCandidateCoverageKey(selectedCoverage) : null)
    ), [selectedCoverage, selectedGeoCoverageName]);
    const isManualGeoBeamSelection = selectedGeoBeamKey !== null && selectedGeoCoverageName === null;
    const normalizedManualGeoSatelliteName = useMemo(
        () => normalizeSatelliteKey(manualGeoSatelliteName),
        [manualGeoSatelliteName]
    );

    const selectedGeoState = useMemo(() => {
        if (!selectedBeamKey && !selectedCoverageGroupKey) {
            return {
                selectedFeatureSet: new Set<Feature<Geometry, GeoJsonProperties>>(),
                renderings: null as SelectedGeoRendering[] | null,
            };
        }

        const selectedFeatures = coverageFeatures.filter((feature) => {
            if (getSanitizedPolygonGeometry(feature) === null) return false;

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

        const parsedFeatures = selectedFeatures
            .map((feature) => {
                const geometry = getSanitizedPolygonGeometry(feature);
                if (!geometry) return null;

                return {
                    feature,
                    geometry,
                    area: approximateRingArea(geometry.outerRing),
                    contourKey: getContourKey(feature),
                    parentIndex: null,
                    directChildIndexes: [],
                    depth: 0,
                    contourLevel: 0,
                    isPrimary: selectedBeamKey !== null && getFeatureBeamCoverageKey(feature) === selectedBeamKey,
                } satisfies ParsedSelectedFeature;
            })
            .filter((entry): entry is ParsedSelectedFeature => entry !== null);

        const indexesByDescendingArea = parsedFeatures
            .map((_, index) => index)
            .sort((left, right) => parsedFeatures[right].area - parsedFeatures[left].area);

        for (const childIndex of indexesByDescendingArea.slice().reverse()) {
            const child = parsedFeatures[childIndex];
            const representativePoint = getRepresentativePoint(child.geometry.outerRing);
            let bestParentIndex: number | null = null;
            let bestParentArea = Number.POSITIVE_INFINITY;

            for (const candidateParentIndex of indexesByDescendingArea) {
                if (candidateParentIndex === childIndex) continue;
                const candidateParent = parsedFeatures[candidateParentIndex];
                if (candidateParent.area <= child.area) continue;
                if (!containsPointInPolygonGeometry(candidateParent.geometry, representativePoint)) continue;
                if (candidateParent.area >= bestParentArea) continue;
                bestParentIndex = candidateParentIndex;
                bestParentArea = candidateParent.area;
            }

            child.parentIndex = bestParentIndex;
            if (bestParentIndex !== null) {
                parsedFeatures[bestParentIndex].directChildIndexes.push(childIndex);
            }
        }

        const depthCache = new Map<number, number>();
        const resolveDepth = (index: number): number => {
            const cachedDepth = depthCache.get(index);
            if (cachedDepth !== undefined) return cachedDepth;

            const parentIndex = parsedFeatures[index].parentIndex;
            const depth = parentIndex === null ? 0 : resolveDepth(parentIndex) + 1;
            depthCache.set(index, depth);
            return depth;
        };

        parsedFeatures.forEach((entry, index) => {
            entry.depth = resolveDepth(index);
        });

        const contourIds = Array.from(new Set(parsedFeatures.map((entry) => entry.contourKey)));
        const contourChildren = new Map<string, Set<string>>();
        const contourInDegree = new Map<string, number>();
        const contourAreaById = new Map<string, number>();

        contourIds.forEach((contourId) => {
            contourChildren.set(contourId, new Set());
            contourInDegree.set(contourId, 0);
        });

        parsedFeatures.forEach((entry) => {
            contourAreaById.set(
                entry.contourKey,
                Math.max(contourAreaById.get(entry.contourKey) ?? 0, entry.area)
            );
        });

        parsedFeatures.forEach((entry) => {
            if (entry.parentIndex === null) return;
            const parent = parsedFeatures[entry.parentIndex];
            if (parent.contourKey === entry.contourKey) return;

            const childContours = contourChildren.get(parent.contourKey);
            if (!childContours || childContours.has(entry.contourKey)) return;

            childContours.add(entry.contourKey);
            contourInDegree.set(
                entry.contourKey,
                (contourInDegree.get(entry.contourKey) ?? 0) + 1
            );
        });

        const contourLevelById = new Map<string, number>();
        const readyContours = contourIds
            .filter((contourId) => (contourInDegree.get(contourId) ?? 0) === 0)
            .sort((left, right) => (contourAreaById.get(right) ?? 0) - (contourAreaById.get(left) ?? 0));

        while (readyContours.length > 0) {
            const contourId = readyContours.shift();
            if (!contourId) continue;

            const parentContourLevels = parsedFeatures
                .filter((entry) => entry.contourKey === contourId && entry.parentIndex !== null)
                .map((entry) => contourLevelById.get(parsedFeatures[entry.parentIndex as number].contourKey) ?? 0);
            const level = parentContourLevels.length > 0 ? Math.max(...parentContourLevels) + 1 : 0;
            contourLevelById.set(contourId, level);

            const childContours = contourChildren.get(contourId);
            if (!childContours) continue;

            for (const childContourId of childContours) {
                const nextInDegree = (contourInDegree.get(childContourId) ?? 1) - 1;
                contourInDegree.set(childContourId, nextInDegree);
                if (nextInDegree === 0) {
                    readyContours.push(childContourId);
                    readyContours.sort(
                        (left, right) => (contourAreaById.get(right) ?? 0) - (contourAreaById.get(left) ?? 0)
                    );
                }
            }
        }

        parsedFeatures.forEach((entry) => {
            entry.contourLevel = contourLevelById.get(entry.contourKey) ?? entry.depth;
        });

        const maxContourLevel = parsedFeatures.reduce(
            (maxLevel, entry) => Math.max(maxLevel, entry.contourLevel),
            0
        );

        const renderings = [...parsedFeatures]
            .sort((left, right) => {
                if (left.contourLevel !== right.contourLevel) {
                    return left.contourLevel - right.contourLevel;
                }
                return right.area - left.area;
            })
            .map((entry, index) => {
                const hierarchy = buildPolygonHierarchy(entry.geometry);
                if (!hierarchy) return null;

                const normalizedLevel = maxContourLevel <= 0
                    ? 1
                    : entry.contourLevel / maxContourLevel;
                const bandStyle = getGeoBandStyle(normalizedLevel, 'selected');

                const contourPositions = [
                    buildContourPositions(entry.geometry.outerRing, GEO_FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M),
                    ...entry.geometry.holes.map((ring) => (
                        buildContourPositions(ring, GEO_FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M)
                    )),
                ].filter((positions): positions is Cartesian3[] => positions !== null);

                return {
                    key: `${selectedCoverageGroupKey ?? selectedBeamKey ?? 'selected'}-${index}`,
                    hierarchy,
                    contourPositions,
                    fillColor: bandStyle.fillColor,
                    contourColor: bandStyle.contourColor,
                    contourWidth: bandStyle.contourWidth,
                } satisfies SelectedGeoRendering;
            })
            .filter((entry): entry is SelectedGeoRendering => entry !== null);

        void renderings;

        return {
            selectedFeatureSet: new Set<Feature<Geometry, GeoJsonProperties>>(),
            renderings: null as SelectedGeoRendering[] | null,
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
            const ring = getSanitizedPolygonGeometry(feature)?.outerRing ?? null;
            if (!ring || ring.length < 3) return 0;
            return approximateRingArea(ring);
        };

        const filteredFeatures = coverageFeatures.filter((feature) => {
            if (getSanitizedPolygonGeometry(feature) === null) return false;
            if (feature.properties?.type === 'ONEWEB_SWATH') return false;
            if (feature.properties?.type === 'ONEWEB_SERVICE_ZONE') return false;
            if (selectedGeoState.selectedFeatureSet.has(feature)) return false;
            if (isManualGeoBeamSelection) {
                return getFeatureBeamCoverageKey(feature) === selectedBeamKey;
            }
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
            const featureCoverageGroupKey = getFeatureCandidateCoverageKey(feature);
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
                    isSelected={
                        (featureCoverageGroupKey !== null && featureCoverageGroupKey === selectedCoverageGroupKey)
                        || (featureBeamKey !== null && featureBeamKey === selectedBeamKey)
                    }
                    isManualGeoOverview={isManualGeoOverview}
                />
            );
        });
    }, [
        candidateCoverages,
        coverageFeatures,
        normalizedManualGeoSatelliteName,
        satelliteTypeByName,
        selectedBeamKey,
        selectedCoverageGroupKey,
        isManualGeoBeamSelection,
        selectedGeoState.selectedFeatureSet,
    ]);

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
                            arcType={ArcType.RHUMB}
                            outline={false}
                            height={GEO_FOOTPRINT_LAYER_HEIGHT_M}
                        />
                    </Entity>
                    {rendering.contourPositions.map((positions, contourIndex) => (
                        <Entity
                            key={`selected-geo-contour-${rendering.key}-${contourIndex}`}
                            name="Selected GEO Coverage contour"
                            polyline={{
                                positions,
                                width: rendering.contourWidth,
                                material: rendering.contourColor,
                                arcType: ArcType.RHUMB,
                                depthFailMaterial: rendering.contourColor,
                                clampToGround: false,
                            }}
                        />
                    ))}
                </React.Fragment>
            ))}
        </>
    );
};

export default React.memo(CoverageLayer);
