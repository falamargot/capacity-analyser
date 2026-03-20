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
import { formatCoordinates } from '../../utils/formatters';
import { getPosition } from './utils';

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
  leoServiceViewModel?: LeoConnectivityViewModel | null;
}

const statusColor = (viewModel?: LeoConnectivityViewModel | null): Color => {
  // Let the computed end-user service status drive the marker color first so an
  // available service does not fall back to the neutral "unknown" gray.
  if (viewModel?.finalServiceStatus === 'BLOCKED') return Color.fromCssColorString('#ef4444');
  if (viewModel?.finalServiceStatus === 'DEGRADED') return Color.fromCssColorString('#f97316');
  if (viewModel?.finalServiceStatus === 'ALLOWED') return Color.fromCssColorString('#10b981');
  if (viewModel?.regulatory.status === 'UNKNOWN') return Color.fromCssColorString('#94a3b8');
  return Color.RED;
};

const statusLabel = (viewModel?: LeoConnectivityViewModel | null): string => {
  if (!viewModel) return 'Selected target';
  if (viewModel.finalServiceStatus === 'BLOCKED') {
    return viewModel.primaryReasonLayer === 'regulatory'
      ? 'Service blocked · RF may still exist'
      : 'Service blocked';
  }
  if (viewModel.finalServiceStatus === 'DEGRADED') return 'Service degraded';
  return 'Service available';
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

  const ringColor = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * pulseSpeed * Math.PI);
    return baseColor.withAlpha(0.12 + pulse * 0.18);
  }, false), [baseColor, pulseSpeed]);

  const ringMaterial = useMemo(() => new ColorMaterialProperty(ringColor), [ringColor]);
  const orbitalRadii = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * pulseSpeed * Math.PI);
    const radius = ringBaseRadius + pulse * ringBaseRadius * 0.4;
    return new Cartesian3(radius, radius, radius);
  }, false), [pulseSpeed, ringBaseRadius]);

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
                height: new ConstantProperty(0),
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
  leoServiceViewModel,
}) => {
  const baseColor = useMemo(() => statusColor(leoServiceViewModel), [leoServiceViewModel]);
  const pulseSpeed = leoServiceViewModel?.renderingHints.userMarkerState === 'blocked'
    ? 1.3
    : leoServiceViewModel?.renderingHints.userMarkerState === 'degraded'
      ? 0.95
      : 0.8;
  const ringBaseRadius = leoServiceViewModel?.renderingHints.userMarkerState === 'blocked'
    ? 42000
    : leoServiceViewModel?.renderingHints.userMarkerState === 'degraded'
      ? 36000
      : 32000;
  const labelText = `${formatCoordinates({ lat: selectedPosition.lat, lng: selectedPosition.lng })}\n${statusLabel(leoServiceViewModel)}`;

  return (
    <SelectionPulseMarker
      position={getPosition(selectedPosition.lat, selectedPosition.lng, 0.01)}
      baseColor={baseColor}
      pulseSpeed={pulseSpeed}
      ringBaseRadius={ringBaseRadius}
      pointPixelSize={pixelSize}
      labelText={labelText}
      name="Selected Position"
      showPoint={true}
    />
  );
};

export default React.memo(SelectedPointStatusMarker);
