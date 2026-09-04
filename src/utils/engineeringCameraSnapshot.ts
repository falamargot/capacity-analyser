/**
 * engineeringCameraSnapshot — freezing and restoring the globe camera.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2). These four functions are
 * pure Cesium plumbing with no component state, and they had to leave the
 * component before the engineering-mode snapshot could: a hook cannot import
 * from `App.tsx`.
 *
 * Two representations exist on purpose. `EngineeringCameraSnapshot` holds live
 * `Cartesian3` instances for an in-memory mode switch; `TelecomCameraSnapshot`
 * holds plain numbers because it is serialised into the session storage, where a
 * class instance would not survive the round trip.
 */

import { Cartesian3, EasingFunction } from 'cesium';
import type { Viewer as CesiumViewerType } from 'cesium';
import type { TelecomCameraSnapshot } from '../state/session/telecomSessionSnapshot';

/** Camera flight duration when a mode switch restores a view, seconds. */
export const ENGINEERING_CAMERA_ANIMATION_SECONDS = 0.34;

export interface EngineeringCameraSnapshot {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  viewportHeight: number;
}

export const captureEngineeringCameraSnapshot = (
  viewer: CesiumViewerType,
  viewportHeight: number,
): EngineeringCameraSnapshot => ({
  position: Cartesian3.clone(viewer.camera.positionWC),
  direction: Cartesian3.clone(viewer.camera.directionWC),
  up: Cartesian3.clone(viewer.camera.upWC),
  viewportHeight,
});

export const captureTelecomCameraSnapshot = (
  viewer: CesiumViewerType,
  viewportHeight: number,
): TelecomCameraSnapshot => ({
  position: {
    x: viewer.camera.positionWC.x,
    y: viewer.camera.positionWC.y,
    z: viewer.camera.positionWC.z,
  },
  direction: {
    x: viewer.camera.directionWC.x,
    y: viewer.camera.directionWC.y,
    z: viewer.camera.directionWC.z,
  },
  up: {
    x: viewer.camera.upWC.x,
    y: viewer.camera.upWC.y,
    z: viewer.camera.upWC.z,
  },
  viewportHeight,
});

export const telecomCameraToEngineeringSnapshot = (
  snapshot: TelecomCameraSnapshot,
): EngineeringCameraSnapshot => ({
  position: new Cartesian3(snapshot.position.x, snapshot.position.y, snapshot.position.z),
  direction: new Cartesian3(snapshot.direction.x, snapshot.direction.y, snapshot.direction.z),
  up: new Cartesian3(snapshot.up.x, snapshot.up.y, snapshot.up.z),
  viewportHeight: snapshot.viewportHeight,
});

export const flyToEngineeringCameraSnapshot = (
  viewer: CesiumViewerType,
  snapshot: EngineeringCameraSnapshot,
  duration = ENGINEERING_CAMERA_ANIMATION_SECONDS,
) => {
  viewer.camera.cancelFlight();
  viewer.camera.flyTo({
    destination: snapshot.position,
    orientation: {
      direction: snapshot.direction,
      up: snapshot.up,
    },
    duration,
    easingFunction: EasingFunction.CUBIC_OUT,
  });
};
