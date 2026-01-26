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
}>(({ feature, index, satellites }) => {
    if (feature.geometry.type !== 'Polygon') return null;

    // Skip OneWeb Comb placeholders - they are rendered by OneWebCombLayer
    if (feature.properties?.type === 'ONEWEB_SWATH' || feature.properties?.type === 'ONEWEB_PREMIUM') {
        return null;
    }

    const coords = feature.geometry.coordinates[0];
    const hierarchy = useMemo(() => {
        try {
            return Cartesian3.fromDegreesArray(coords.flat() as number[]);
        } catch {
            return null;
        }
    }, [coords]);

    if (!hierarchy) return null;

    const satName = feature.properties?.satelliteId;
    const sat = satellites.find(s => s.name === satName);
    const color = useMemo(() => {
        const colorHex = getCoverageColor(feature.properties?.type, 0.4, sat);
        return Color.fromCssColorString(colorHex);
    }, [feature.properties?.type, sat]);

    return (
        <Entity key={`coverage-${index}`} name={feature.properties?.name}>
            <PolygonGraphics
                hierarchy={hierarchy}
                material={color}
            />
        </Entity>
    );
});

CoveragePolygon.displayName = 'CoveragePolygon';

const CoverageLayer: React.FC<CoverageLayerProps> = ({
    coverageFeatures,
    satellites
}) => {
    const coverageEntities = useMemo(() => {
        return coverageFeatures
            .filter(feature => {
                // Filter out OneWeb comb placeholders and non-polygons
                if (feature.geometry.type !== 'Polygon') return false;
                if (feature.properties?.type === 'ONEWEB_SWATH') return false;
                if (feature.properties?.type === 'ONEWEB_PREMIUM') return false;
                return true;
            })
            .map((feature, index) => (
                <CoveragePolygon
                    key={`coverage-${index}`}
                    feature={feature}
                    index={index}
                    satellites={satellites}
                />
            ));
    }, [coverageFeatures, satellites]);

    return <>{coverageEntities}</>;
};

export default React.memo(CoverageLayer);
