import React, { useMemo } from 'react';
import { Entity, LabelGraphics } from 'resium';
import {
  Cartesian2,
  Cartesian3,
  CallbackProperty,
  CallbackPositionProperty,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  HorizontalOrigin,
  JulianDate,
  VerticalOrigin,
} from 'cesium';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import {
  deriveSelectedPointStatusPresentation,
  type GeoPointStatus,
  type SelectedPointScope,
} from '../../utils/selectedPointStatus';
import { getPosition } from './utils';
import { GROUND_POINT_ALTITUDE_KM, GROUND_POINT_LAYER_HEIGHT_M, LABEL_EYE_OFFSET } from './layerHeights';

interface SelectionPulseMarkerProps {
  position: Cartesian3 | CallbackPositionProperty;
  anchorType?: 'ground' | 'orbital';
  baseColor?: Color;
  pulseSpeed?: number;
  ringBaseRadius?: number;
  pointPixelSize?: CallbackProperty;
  labelText?: string;
  name?: string;
  showPoint?: boolean;
}

interface SelectedPointStatusMarkerProps {
  selectedPosition: { lat: number; lng: number; altitude?: number };
  pixelSize: CallbackProperty;
  satelliteScope: SelectedPointScope;
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  geoPointStatus?: GeoPointStatus | null;
}

const statusColor = (tone: ReturnType<typeof deriveSelectedPointStatusPresentation>['tone']): Color => {
  if (tone === 'danger') return Color.fromCssColorString('#ef4444');
  if (tone === 'warning') return Color.fromCssColorString('#f97316');
  if (tone === 'success') return Color.fromCssColorString('#10b981');
  return Color.fromCssColorString('#94a3b8');
};

export const SelectionPulseMarker: React.FC<SelectionPulseMarkerProps> = ({
  position,
  anchorType = 'ground',
  baseColor = Color.RED,
  pulseSpeed = 0.8,
  ringBaseRadius = 32000,
  pointPixelSize,
  labelText,
  name = 'Selected Position',
  showPoint = false,
}) => {
  const ringRadius = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * pulseSpeed * Math.PI);
    return ringBaseRadius + pulse * ringBaseRadius * 0.55;
  }, false), [pulseSpeed, ringBaseRadius]);

  // Scratch instances reused across frames so the per-frame callbacks below never
  // allocate. Closure-local to each useMemo => one scratch per CallbackProperty
  // lifetime; recreated only when deps change.
  const ringColor = useMemo(() => {
    const scratchColor = new Color();
    return new CallbackProperty((time?: JulianDate) => {
      const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(now * pulseSpeed * Math.PI);
      Color.clone(baseColor, scratchColor);
      scratchColor.alpha = 0.12 + pulse * 0.18;
      return scratchColor;
    }, false);
  }, [baseColor, pulseSpeed]);

  const ringMaterial = useMemo(() => new ColorMaterialProperty(ringColor), [ringColor]);
  const orbitalRadii = useMemo(() => {
    const scratchRadii = new Cartesian3();
    return new CallbackProperty((time?: JulianDate) => {
      const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(now * pulseSpeed * Math.PI);
      const radius = ringBaseRadius + pulse * ringBaseRadius * 0.4;
      scratchRadii.x = radius;
      scratchRadii.y = radius;
      scratchRadii.z = radius;
      return scratchRadii;
    }, false);
  }, [pulseSpeed, ringBaseRadius]);

  return (
    <>
      <Entity
        position={position}
        {...(anchorType === 'orbital'
          ? {
              ellipsoid: {
                radii: orbitalRadii,
                material: ringMaterial,
                outline: new ConstantProperty(true),
                outlineColor: new ConstantProperty(baseColor.withAlpha(0.9)),
                outlineWidth: new ConstantProperty(2),
                subdivisions: new ConstantProperty(64),
                stackPartitions: new ConstantProperty(32),
                slicePartitions: new ConstantProperty(32),
              },
            }
          : {
              ellipse: {
                semiMajorAxis: ringRadius,
                semiMinorAxis: ringRadius,
                material: ringMaterial,
                outline: new ConstantProperty(true),
                outlineColor: new ConstantProperty(baseColor.withAlpha(0.85)),
                outlineWidth: new ConstantProperty(2),
                height: new ConstantProperty(GROUND_POINT_LAYER_HEIGHT_M),
              },
            })}
      />
      {showPoint && pointPixelSize && (
        <Entity
          position={position}
          point={{
            pixelSize: pointPixelSize,
            color: baseColor,
            outlineColor: baseColor.withAlpha(0.9),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }}
          name={name}
        >
          {labelText && (
            <LabelGraphics
              text={labelText}
              font="600 13px Inter, sans-serif"
              fillColor={Color.WHITE}
              outlineWidth={3}
              style={2}
              showBackground={true}
              backgroundColor={baseColor.withAlpha(0.78)}
              backgroundPadding={new Cartesian2(8, 5)}
              pixelOffset={new Cartesian2(0, -26)}
              verticalOrigin={VerticalOrigin.BOTTOM}
              horizontalOrigin={HorizontalOrigin.CENTER}
              eyeOffset={LABEL_EYE_OFFSET}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
          )}
        </Entity>
      )}
    </>
  );
};

const SelectedPointStatusMarker: React.FC<SelectedPointStatusMarkerProps> = ({
  selectedPosition,
  pixelSize,
  satelliteScope,
  leoServiceViewModel,
  geoPointStatus = null,
}) => {
  const presentation = useMemo(
    () => deriveSelectedPointStatusPresentation({
      scope: satelliteScope,
      leoServiceViewModel,
      geoStatus: geoPointStatus,
    }),
    [geoPointStatus, leoServiceViewModel, satelliteScope]
  );
  const baseColor = useMemo(() => statusColor(presentation.tone), [presentation.tone]);
  const pulseSpeed = presentation.tone === 'danger'
    ? 1.3
    : presentation.tone === 'warning'
      ? 0.95
      : 0.8;
  const ringBaseRadius = presentation.tone === 'danger'
    ? 42000
    : presentation.tone === 'warning'
      ? 36000
      : 32000;

  return (
    <SelectionPulseMarker
      baseColor={baseColor}
      pulseSpeed={pulseSpeed}
      ringBaseRadius={ringBaseRadius}
      pointPixelSize={pixelSize}
      name="Selected Position"
      showPoint={true}
      position={getPosition(selectedPosition.lat, selectedPosition.lng, GROUND_POINT_ALTITUDE_KM)}
    />
  );
};

export default React.memo(SelectedPointStatusMarker);
