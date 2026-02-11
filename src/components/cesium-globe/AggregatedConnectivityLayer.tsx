/**
 * AggregatedConnectivityLayer - Renders a semi-transparent coverage envelope for GEO or LEO
 */
import React, { useMemo } from 'react';
import { Entity, PolygonGraphics, EllipseGraphics } from 'resium';
import {
    Cartesian3,
    Color,
    CallbackProperty,
    Viewer as CesiumViewerType
} from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { STANDARD_RADIUS_KM, BACKHAUL_RADIUS_KM } from '../../utils/leoFootprint';
import { usePositionCallbacks } from './hooks';

interface AggregatedConnectivityLayerProps {
    satelliteScope: SatelliteScope;
    satellites: SatelliteData[];
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    viewerRef: React.RefObject<CesiumViewerType | null>;
    show: boolean;
}

const LeoCoverageEntity = React.memo<{
    sat: SatelliteData;
    positionCallback: any;
}>(({ sat, positionCallback }) => {
    // Semi-transparent Pink for LEO envelope
    // Uses the BACKHAUL_RADIUS_KM (approx 2500km) to show visibility/feasibility
    return (
        <Entity
            position={positionCallback}
            name={`${sat.name} Connectivity Envelope`}
        >
            <EllipseGraphics
                semiMajorAxis={BACKHAUL_RADIUS_KM * 1000}
                semiMinorAxis={BACKHAUL_RADIUS_KM * 1000}
                material={Color.DEEPPINK.withAlpha(0.15)}
                outline={false}
            />
        </Entity>
    );
});

LeoCoverageEntity.displayName = 'LeoCoverageEntity';

const GeoCoverageEntity = React.memo<{
    feature: Feature<Geometry, GeoJsonProperties>;
    index: number;
}>(({ feature, index }) => {
    if (feature.geometry.type !== 'Polygon') return null;

    // Skip OneWeb placeholders
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

    // Semi-transparent Blue for GEO envelope
    return (
        <Entity key={`agg-geo-${index}`} name="GEO Connectivity Envelope">
            <PolygonGraphics
                hierarchy={hierarchy}
                material={Color.ROYALBLUE.withAlpha(0.15)}
                outline={false}
            />
        </Entity>
    );
});

GeoCoverageEntity.displayName = 'GeoCoverageEntity';

const AggregatedConnectivityLayer: React.FC<AggregatedConnectivityLayerProps> = ({
    satelliteScope,
    satellites,
    coverageFeatures,
    show,
    viewerRef
}) => {
    const { getSatellitePositionCallback } = usePositionCallbacks(satellites, []);

    if (!show || satelliteScope === 'ALL') {
        return null;
    }

    // GEO Mode: Render bounds of all satellites
    // Ideally we'd compute a geometric union, but rendering all translucent polygons
    // creates a visual union effect effectively enough for "feasibility context".
    if (satelliteScope === 'GEO') {
        return (
            <>
                {coverageFeatures.map((feature, index) => (
                    <GeoCoverageEntity
                        key={`agg-geo-${index}`}
                        feature={feature}
                        index={index}
                    />
                ))}
            </>
        );
    }

    // LEO Mode: Render visibility circles around all LEO satellites
    if (satelliteScope === 'LEO') {
        return (
            <>
                {satellites
                    .filter(sat => sat.type !== 'EUTELSAT') // OneWeb only
                    .map(sat => (
                        <LeoCoverageEntity
                            key={sat.id}
                            sat={sat}
                            positionCallback={getSatellitePositionCallback(sat)}
                        />
                    ))}
            </>
        );
    }

    return null;
};

export default React.memo(AggregatedConnectivityLayer);
