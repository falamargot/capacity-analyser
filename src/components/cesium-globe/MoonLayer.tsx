import React, { useEffect, useMemo, useRef } from 'react';
import { Entity, useCesium } from 'resium';
import * as Cesium from 'cesium';
import {
  CallbackPositionProperty,
  Cartesian2,
  Cartesian3,
  Color,
  Ellipsoid,
  HorizontalOrigin,
  LabelStyle,
  Material,
  Matrix3,
  Matrix4,
  NearFarScalar,
  ReferenceFrame,
  Simon1994PlanetaryPositions,
  Transforms,
  VerticalOrigin,
  buildModuleUrl,
} from 'cesium';

interface MoonLayerProps {
  enableLighting?: boolean;
  selected?: boolean;
}

const EllipsoidPrimitiveCtor = (Cesium as any).EllipsoidPrimitive as new (options?: Record<string, unknown>) => {
  show: boolean;
  id?: string;
  modelMatrix: Matrix4;
  material: {
    uniforms: Record<string, unknown>;
    translucent: boolean;
  };
  onlySunLighting: boolean;
  destroy?: () => void;
  isDestroyed?: () => boolean;
};

const IauOrientationAxesCtor = (Cesium as any).IauOrientationAxes as new () => {
  evaluate: (time: Cesium.JulianDate, result?: Matrix3) => Matrix3;
};

const MoonLayer: React.FC<MoonLayerProps> = ({ enableLighting = false, selected = false }) => {
  const { viewer } = useCesium();
  const primitiveRef = useRef<InstanceType<typeof EllipsoidPrimitiveCtor> | null>(null);
  const enableLightingRef = useRef(enableLighting);

  enableLightingRef.current = enableLighting;

  useEffect(() => {
    if (!viewer) return;

    const primitive = new EllipsoidPrimitiveCtor({
      id: 'moon-body',
      radii: Ellipsoid.MOON.radii,
      material: Material.fromType(Material.ImageType),
      depthTestEnabled: true,
    });
    primitive.material.uniforms.image = buildModuleUrl('Assets/Textures/moonSmall.jpg');
    primitive.material.translucent = false;
    primitive.onlySunLighting = enableLightingRef.current;
    primitiveRef.current = primitive;

    const axes = new IauOrientationAxesCtor();
    const icrfToFixed = new Matrix3();
    const rotation = new Matrix3();
    const translation = new Cartesian3();

    const updateMoonPrimitive = () => {
      const time = viewer.clock.currentTime;
      const fixedMatrix = Transforms.computeIcrfToFixedMatrix(time, icrfToFixed)
        ?? Transforms.computeTemeToPseudoFixedMatrix(time, icrfToFixed);

      const orientation = axes.evaluate(time, rotation);
      Matrix3.transpose(orientation, orientation);
      Matrix3.multiply(fixedMatrix, orientation, orientation);

      Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(time, translation);
      Matrix3.multiplyByVector(fixedMatrix, translation, translation);

      Matrix4.fromRotationTranslation(orientation, translation, primitive.modelMatrix);
      primitive.onlySunLighting = enableLightingRef.current;
    };

    viewer.scene.primitives.add(primitive as unknown as Parameters<typeof viewer.scene.primitives.add>[0]);
    viewer.scene.preRender.addEventListener(updateMoonPrimitive);
    updateMoonPrimitive();
    viewer.scene.requestRender();

    return () => {
      viewer.scene.preRender.removeEventListener(updateMoonPrimitive);
      if (!viewer.isDestroyed() && viewer.scene.primitives.contains(primitive as unknown as Parameters<typeof viewer.scene.primitives.add>[0])) {
        viewer.scene.primitives.remove(primitive as unknown as Parameters<typeof viewer.scene.primitives.add>[0]);
      }
      primitiveRef.current = null;
      viewer.scene.requestRender();
    };
  }, [viewer]);

  useEffect(() => {
    const primitive = primitiveRef.current;
    if (primitive) {
      primitive.onlySunLighting = enableLighting;
      viewer?.scene.requestRender();
    }
  }, [enableLighting, viewer]);

  const moonPosition = useMemo(() => (
    new CallbackPositionProperty((time, result) => (
      Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(time, result)
    ), false, ReferenceFrame.INERTIAL)
  ), []);

  return selected ? (
    <Entity
      id="moon-label"
      name="Moon"
      position={moonPosition}
      label={{
        text: 'Moon',
        fillColor: Color.fromCssColorString('#e2e8f0'),
        outlineColor: Color.fromCssColorString('#0f172a'),
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#0f172a').withAlpha(0.7),
        horizontalOrigin: HorizontalOrigin.LEFT,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(18, -18),
        scale: 0.72,
        scaleByDistance: new NearFarScalar(2.0e6, 1.0, 8.0e8, 0.45),
        translucencyByDistance: new NearFarScalar(2.0e6, 1.0, 8.0e8, 0.55),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }}
    />
  ) : null;
};

export default React.memo(MoonLayer);
