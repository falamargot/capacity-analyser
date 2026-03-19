import React, { useMemo } from 'react';
import { Entity, LabelGraphics } from 'resium';
import {
  Cartesian2,
  CallbackProperty,
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

interface SelectedPointStatusMarkerProps {
  selectedPosition: { lat: number; lng: number; altitude?: number };
  pixelSize: CallbackProperty;
  leoServiceViewModel?: LeoConnectivityViewModel | null;
}

const statusColor = (viewModel?: LeoConnectivityViewModel | null): Color => {
  if (viewModel?.finalServiceStatus === 'BLOCKED') return Color.fromCssColorString('#ef4444');
  if (viewModel?.finalServiceStatus === 'DEGRADED') return Color.fromCssColorString('#f59e0b');
  if (viewModel?.finalServiceStatus === 'ALLOWED') return Color.fromCssColorString('#10b981');
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

const SelectedPointStatusMarker: React.FC<SelectedPointStatusMarkerProps> = ({
  selectedPosition,
  pixelSize,
  leoServiceViewModel,
}) => {
  const baseColor = useMemo(() => statusColor(leoServiceViewModel), [leoServiceViewModel]);
  const pulseSpeed = leoServiceViewModel?.finalServiceStatus === 'BLOCKED' ? 1.2 : 0.8;
  const ringBaseRadius = leoServiceViewModel?.finalServiceStatus === 'BLOCKED' ? 42000 : 32000;

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

  const labelText = `${formatCoordinates({ lat: selectedPosition.lat, lng: selectedPosition.lng })}\n${statusLabel(leoServiceViewModel)}`;

  return (
    <>
      <Entity
        position={getPosition(selectedPosition.lat, selectedPosition.lng, 0.01)}
        ellipse={{
          semiMajorAxis: ringRadius,
          semiMinorAxis: ringRadius,
          material: ringMaterial,
          outline: new ConstantProperty(true),
          outlineColor: new ConstantProperty(baseColor.withAlpha(0.85)),
          outlineWidth: new ConstantProperty(2),
          height: new ConstantProperty(0),
        }}
      />
      <Entity
        position={getPosition(selectedPosition.lat, selectedPosition.lng, 0.01)}
        point={{
          pixelSize,
          color: baseColor,
          outlineColor: baseColor.withAlpha(0.9),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }}
        name="Selected Position"
      >
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
      </Entity>
    </>
  );
};

export default React.memo(SelectedPointStatusMarker);
