/**
 * IssLayer — Renders the ISS entity, orbit path, and manages follow-camera mode.
 *
 * Orbit polylines are computed at most every 60 s by the parent hook and passed
 * as pre-computed arrays, so they are never recalculated per Cesium frame.
 * Only the ISS marker position uses a CallbackProperty (reads a ref each frame).
 */
import React, { useMemo, useRef, useEffect } from 'react';
import { Entity } from 'resium';
import {
  Cartesian3,
  Cartesian2,
  Color,
  VerticalOrigin,
  CallbackPositionProperty,
  CallbackProperty,
  LabelStyle,
  Viewer as CesiumViewerType,
} from 'cesium';
import type { IssPosition, IssOrbitPath } from '../../modules/iss/issService';
import type { CameraMetricsSnapshot } from './utils';
import { requestGlobeRender } from '../../utils/globeRenderRequest';

interface IssLayerProps {
  positionRef: React.RefObject<IssPosition | null>;
  orbitPath: IssOrbitPath | null;
  hasPosition: boolean;
  isSelected: boolean;
  isFollowing: boolean;
  enabled: boolean;
  onIssClick: () => void;
  viewerRef: React.RefObject<CesiumViewerType | null>;
  cameraMetricsRef: React.RefObject<CameraMetricsSnapshot>;
}

const ISS_COLOR_NORMAL = Color.fromCssColorString('#22d3ee');   // cyan-400
const ISS_COLOR_SELECTED = Color.fromCssColorString('#00e5ff'); // brighter cyan
const ISS_LABEL_FILL = Color.fromCssColorString('#e0faff');
const ISS_LABEL_OUTLINE = Color.fromCssColorString('#03202a');

const IssLayer: React.FC<IssLayerProps> = ({
  positionRef,
  orbitPath,
  hasPosition,
  isSelected,
  isFollowing,
  enabled,
  onIssClick,
  viewerRef,
}) => {
    // requestRenderMode wiring, step 2b.2 (Group B: data-cadence followers).
    // BEHAVIOUR-NEUTRAL: requestRender() is a no-op while scene.requestRenderMode
    // is false, which is the current configuration. ISS position is advanced by an existing preRender handler; this covers path/selection changes.
    useEffect(() => {
        requestGlobeRender(viewerRef.current);
    }, [viewerRef, orbitPath, hasPosition, isSelected, isFollowing, enabled]);

  // Stable CallbackPositionProperty — reads the ref each frame, no re-creation on position update
  const positionCallback = useMemo(
    () =>
      new CallbackPositionProperty(() => {
        const p = positionRef.current;
        if (!p) return Cartesian3.fromDegrees(0, 0, 420_000);
        return Cartesian3.fromDegrees(p.lng, p.lat, p.altKm * 1000);
      }, false),
    [positionRef],
  );

  const isSelectedRef = useRef(isSelected);
  isSelectedRef.current = isSelected;

  const pointSizeCallback = useMemo(
    () =>
      new CallbackProperty(() => (isSelectedRef.current ? 15 : 12), false),
    [],
  );

  // Follow-camera: keep the ISS centered while preserving the user's current
  // camera offset, so wheel / pinch zoom remains fully under user control.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isFollowing) return;

    let lastTarget: Cartesian3 | null = null;
    const targetScratch = new Cartesian3();
    const offsetScratch = new Cartesian3();
    const destinationScratch = new Cartesian3();
    const directionScratch = new Cartesian3();
    const upScratch = new Cartesian3();

    const onPreRender = () => {
      const p = positionRef.current;
      if (!p || !viewer) return;

      const camera = viewer.camera;
      const target = Cartesian3.fromDegrees(p.lng, p.lat, p.altKm * 1000, undefined, targetScratch);
      Cartesian3.subtract(camera.positionWC, lastTarget ?? target, offsetScratch);
      const destination = Cartesian3.add(target, offsetScratch, destinationScratch);
      Cartesian3.subtract(target, destination, directionScratch);

      if (Cartesian3.magnitudeSquared(directionScratch) === 0) {
        lastTarget = Cartesian3.clone(target, lastTarget ?? new Cartesian3());
        return;
      }

      Cartesian3.normalize(directionScratch, directionScratch);
      Cartesian3.clone(camera.upWC, upScratch);

      camera.setView({
        destination,
        orientation: {
          direction: directionScratch,
          up: upScratch,
        },
      });

      lastTarget = Cartesian3.clone(target, lastTarget ?? new Cartesian3());
    };

    viewer.scene.preRender.addEventListener(onPreRender);

    return () => {
      viewer.scene.preRender.removeEventListener(onPreRender);
    };
  }, [isFollowing, positionRef, viewerRef]);

  // Orbit polylines: computed from pre-calculated arrays (no per-frame recomputation)
  const pastPositions = useMemo(() => {
    const pts = orbitPath?.past;
    if (!pts || pts.length < 2) return null;
    return Cartesian3.fromDegreesArrayHeights(
      pts.flatMap((p) => [p.lng, p.lat, p.altKm * 1000]),
    );
  }, [orbitPath?.past, orbitPath?.computedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const futurePositions = useMemo(() => {
    const pts = orbitPath?.future;
    if (!pts || pts.length < 2) return null;
    return Cartesian3.fromDegreesArrayHeights(
      pts.flatMap((p) => [p.lng, p.lat, p.altKm * 1000]),
    );
  }, [orbitPath?.future, orbitPath?.computedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled || !hasPosition) return null;

  const billboardColor = isSelected ? ISS_COLOR_SELECTED : ISS_COLOR_NORMAL;

  return (
    <>
      {/* Past orbit — faded */}
      {pastPositions && (
        <Entity
          id="iss-orbit-past"
          polyline={{
            positions: pastPositions,
            width: 1.5,
            material: Color.fromCssColorString('#22d3ee').withAlpha(0.28),
            clampToGround: false,
          }}
        />
      )}

      {/* Future orbit — bright */}
      {futurePositions && (
        <Entity
          id="iss-orbit-future"
          polyline={{
            positions: futurePositions,
            width: 2.0,
            material: Color.fromCssColorString('#22d3ee').withAlpha(0.72),
            clampToGround: false,
          }}
        />
      )}

      {/* ISS marker */}
      <Entity
        id="iss-entity"
        position={positionCallback}
        point={{
          pixelSize: pointSizeCallback,
          color: billboardColor,
          outlineColor: Color.WHITE.withAlpha(0.92),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }}
        label={{
          text: 'ISS',
          font: '600 13px sans-serif',
          fillColor: ISS_LABEL_FILL,
          outlineColor: ISS_LABEL_OUTLINE,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(0, 18),
          verticalOrigin: VerticalOrigin.TOP,
          scale: isSelected ? 1 : 0.92,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#031923').withAlpha(0.72),
          backgroundPadding: new Cartesian2(6, 4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }}
        name="International Space Station"
        onClick={onIssClick}
      />
    </>
  );
};

export default React.memo(IssLayer);
