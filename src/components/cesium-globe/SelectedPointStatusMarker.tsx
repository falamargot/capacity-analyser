import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Entity, LabelGraphics, useCesium } from 'resium';
import {
  Cartesian2,
  Cartesian3,
  CallbackProperty,
  CallbackPositionProperty,
  Color,
  ConstantProperty,
  HorizontalOrigin,
  VerticalOrigin,
} from 'cesium';
import { requestGlobeRender } from '../../utils/globeRenderRequest';
import {
  createSelectionPulseProperties,
  SETTLED_PULSE,
  startSelectionPulse,
} from './selectionPulse';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import {
  deriveSelectedPointStatusPresentation,
  type GeoPointStatus,
  type SelectedPointScope,
} from '../../utils/selectedPointStatus';
import { getPosition } from './utils';
import { GROUND_POINT_ALTITUDE_KM, GROUND_POINT_LAYER_HEIGHT_M, LABEL_EYE_OFFSET } from './layerHeights';

interface SelectionPulseMarkerProps {
  entityId?: string;
  position: Cartesian3 | CallbackPositionProperty;
  anchorType?: 'ground' | 'orbital';
  baseColor?: Color;
  pulseSpeed?: number;
  ringBaseRadius?: number;
  pointPixelSize?: CallbackProperty;
  labelText?: string;
  name?: string;
  showPoint?: boolean;
  opacityMultiplier?: number;
}

interface SelectedPointStatusMarkerProps {
  selectedPosition: { lat: number; lng: number; altitude?: number };
  pixelSize: CallbackProperty;
  satelliteScope: SelectedPointScope;
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  geoPointStatus?: GeoPointStatus | null;
  markerVariant?: 'status' | 'site-b';
}

const statusColor = (tone: ReturnType<typeof deriveSelectedPointStatusPresentation>['tone']): Color => {
  if (tone === 'danger') return Color.fromCssColorString('#ef4444');
  if (tone === 'warning') return Color.fromCssColorString('#f97316');
  if (tone === 'success') return Color.fromCssColorString('#10b981');
  return Color.fromCssColorString('#94a3b8');
};

const SITE_B_MARKER_COLOR = Color.fromCssColorString('#ec4899');

// Module-level constants: shared by every marker and never re-created per
// render, so Resium has nothing to re-assign when the parent re-renders.
const OUTLINE_ON = new ConstantProperty(true);
const OUTLINE_WIDTH = new ConstantProperty(2);
const GROUND_RING_HEIGHT = new ConstantProperty(GROUND_POINT_LAYER_HEIGHT_M);
const ORBITAL_SUBDIVISIONS = new ConstantProperty(64);
const ORBITAL_STACK_PARTITIONS = new ConstantProperty(32);
const ORBITAL_SLICE_PARTITIONS = new ConstantProperty(32);

/**
 * Tracks `prefers-reduced-motion`. Local to this module rather than shared with
 * PathFlowAnimation's copy, which Lot 2C.1 must not touch.
 */
const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReduced(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return reduced;
};

export const SelectionPulseMarker: React.FC<SelectionPulseMarkerProps> = ({
  entityId,
  position,
  anchorType = 'ground',
  baseColor = Color.RED,
  pulseSpeed = 0.8,
  ringBaseRadius = 32000,
  pointPixelSize,
  labelText,
  name = 'Selected Position',
  showPoint = false,
  opacityMultiplier = 1,
}) => {
  const { viewer } = useCesium();
  const reducedMotion = usePrefersReducedMotion();

  // `baseColor` is frequently a fresh `Color.fromCssColorString(...)` created
  // inline by CesiumGlobe's render, so it can never be a useMemo dependency:
  // every parent re-render would rebuild the properties and restart the
  // animation, which is exactly the "renders forever" behaviour Lot 2C.1
  // removes. Depend on the colour's VALUE instead and read the instance
  // through a ref.
  const colorKey = `${baseColor.red},${baseColor.green},${baseColor.blue},${baseColor.alpha}`;
  const baseColorRef = useRef(baseColor);
  baseColorRef.current = baseColor;

  // Lot 2C.1: constant properties driven by a bounded animation, replacing the
  // three time-dependent `CallbackProperty(fn, false)` instances that used to
  // keep the scene rendering for as long as the marker existed. See
  // ./selectionPulse.ts for the curve, the cadence and the settle rule.
  const pulseProperties = useMemo(
    () => createSelectionPulseProperties({
      baseColor: baseColorRef.current,
      ringBaseRadius,
      opacityMultiplier,
      anchorType,
      outlineAlpha: anchorType === 'orbital' ? 0.9 : 0.85,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colorKey stands in for baseColor (see above).
    [anchorType, colorKey, opacityMultiplier, ringBaseRadius],
  );

  // One bounded pulse per mount, and one more whenever the marker's identity
  // changes (colour/status, speed, radius, opacity, anchor) — a status change
  // is precisely when the pulse is worth re-playing. Cancelled on unmount or
  // replacement by the cleanup below.
  useEffect(() => {
    if (reducedMotion) {
      pulseProperties.apply(SETTLED_PULSE);
      requestGlobeRender(viewer);
      return;
    }
    return startSelectionPulse({
      pulseSpeed,
      onPulse: (pulse) => {
        pulseProperties.apply(pulse);
        requestGlobeRender(viewer);
      },
    });
  }, [pulseProperties, pulseSpeed, reducedMotion, viewer]);

  const { ringRadius, orbitalRadii, ringMaterial, outlineColor } = pulseProperties;

  return (
    <>
      <Entity
        position={position}
        {...(anchorType === 'orbital'
          ? {
              ellipsoid: {
                radii: orbitalRadii,
                material: ringMaterial,
                outline: OUTLINE_ON,
                outlineColor,
                outlineWidth: OUTLINE_WIDTH,
                subdivisions: ORBITAL_SUBDIVISIONS,
                stackPartitions: ORBITAL_STACK_PARTITIONS,
                slicePartitions: ORBITAL_SLICE_PARTITIONS,
              },
            }
          : {
              ellipse: {
                semiMajorAxis: ringRadius,
                semiMinorAxis: ringRadius,
                material: ringMaterial,
                outline: OUTLINE_ON,
                outlineColor,
                outlineWidth: OUTLINE_WIDTH,
                height: GROUND_RING_HEIGHT,
              },
            })}
      />
      {/* PERF-3: always mounted with a stable `show` prop instead of a
          conditional-JSX-presence Entity — matches the fix already applied to
          the LEO S2S entities (see TransmissionLinks.tsx) for the same
          underlying reason: Resium's Entity add()/remove() is async, so
          toggling JSX presence on/off risks racing that lifecycle if `showPoint`
          or `pointPixelSize` ever change while mounted. Today they're per-instance
          configuration (constant for a given marker's lifetime, not something
          that flips at the 1 Hz simulation tick), so this is a hardening, not a
          fix for an observed bug. */}
      <Entity
        id={entityId}
        show={showPoint && !!pointPixelSize}
        position={position}
        point={{
          pixelSize: pointPixelSize ?? 0,
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
    </>
  );
};

const SelectedPointStatusMarker: React.FC<SelectedPointStatusMarkerProps> = ({
  selectedPosition,
  pixelSize,
  satelliteScope,
  leoServiceViewModel,
  geoPointStatus = null,
  markerVariant = 'status',
}) => {
  const presentation = useMemo(
    () => deriveSelectedPointStatusPresentation({
      scope: satelliteScope,
      leoServiceViewModel,
      geoStatus: geoPointStatus,
    }),
    [geoPointStatus, leoServiceViewModel, satelliteScope]
  );
  const baseColor = useMemo(
    () => markerVariant === 'site-b' ? SITE_B_MARKER_COLOR : statusColor(presentation.tone),
    [markerVariant, presentation.tone]
  );
  const pulseSpeed = markerVariant === 'site-b' ? 0.8 : presentation.tone === 'danger'
    ? 1.3
    : presentation.tone === 'warning'
      ? 0.95
      : 0.8;
  const ringBaseRadius = markerVariant === 'site-b' ? 32000 : presentation.tone === 'danger'
    ? 42000
    : presentation.tone === 'warning'
      ? 36000
      : 32000;

  return (
    <SelectionPulseMarker
      entityId={markerVariant === 'site-b' ? 'engineering-node-site-b' : 'engineering-node-site-a'}
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
