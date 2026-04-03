import React, { useMemo } from 'react';
import { Entity, PolylineGraphics } from 'resium';
import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  HorizontalOrigin,
  JulianDate,
  LabelStyle,
  NearFarScalar,
  ReferenceFrame,
  VerticalOrigin,
} from 'cesium';
import type { ArtemisTrackerPosition, ArtemisTrackerSnapshot } from '../../services/artemisService';

interface ArtemisLayerProps {
  snapshot: ArtemisTrackerSnapshot | null;
  show: boolean;
}

const positionToCartesian = (position: ArtemisTrackerPosition): Cartesian3 | null => {
  if (position.frame === 'geodetic') {
    if (position.lat == null || position.lng == null || position.altKm == null) return null;
    return Cartesian3.fromDegrees(position.lng, position.lat, position.altKm * 1000);
  }

  if (position.xKm == null || position.yKm == null || position.zKm == null) return null;
  return new Cartesian3(position.xKm * 1000, position.yKm * 1000, position.zKm * 1000);
};

const ArtemisLayer: React.FC<ArtemisLayerProps> = ({ snapshot, show }) => {
  const currentPosition = useMemo(() => {
    if (!snapshot?.position) return null;

    const cartesian = positionToCartesian(snapshot.position);
    if (!cartesian) return null;

    if (snapshot.position.frame === 'earth-centered-inertial') {
      return new ConstantPositionProperty(cartesian, ReferenceFrame.INERTIAL);
    }

    return cartesian;
  }, [snapshot]);

  const trajectoryPositions = useMemo(() => {
    if (!snapshot?.trajectory.length) return [];
    return snapshot.trajectory
      .filter((position) => position.frame !== 'earth-centered-inertial')
      .map((position) => positionToCartesian(position))
      .filter((position): position is Cartesian3 => position !== null);
  }, [snapshot]);

  if (!show || !currentPosition) {
    return null;
  }

  return (
    <>
      <Entity
        id="artemis-ii"
        name="Artemis II / Orion"
        position={currentPosition}
        point={{
          pixelSize: 6,
          color: Color.fromCssColorString('#fb923c'),
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(5.0e6, 1.2, 8.0e8, 0.55),
        }}
        label={{
          text: 'Artemis II',
          fillColor: Color.fromCssColorString('#fdba74'),
          outlineColor: Color.fromCssColorString('#7c2d12'),
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#111827').withAlpha(0.72),
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(12, -10),
          scale: 0.8,
          scaleByDistance: new NearFarScalar(2.0e6, 1.0, 8.0e8, 0.45),
          translucencyByDistance: new NearFarScalar(2.0e6, 1.0, 8.0e8, 0.55),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }}
      />

      {trajectoryPositions.length >= 2 && (
        <Entity name="Artemis II Trajectory">
          <PolylineGraphics
            positions={trajectoryPositions}
            width={2}
            material={Color.fromCssColorString('#f97316').withAlpha(0.72)}
            clampToGround={false}
          />
        </Entity>
      )}

    </>
  );
};

export default React.memo(ArtemisLayer);
