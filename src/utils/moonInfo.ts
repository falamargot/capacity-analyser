import {
  Cartographic,
  Cartesian3,
  Ellipsoid,
  JulianDate,
  Matrix3,
  Math as CesiumMath,
  Simon1994PlanetaryPositions,
  Transforms,
} from 'cesium';

const EARTH_MEAN_RADIUS_KM = 6371.0;
export const MOON_MEAN_RADIUS_KM = 1737.4;

export interface MoonSnapshot {
  time: JulianDate;
  distanceFromEarthCenterKm: number;
  distanceFromEarthSurfaceKm: number;
  illuminatedFraction: number;
  subEarthLatitudeDeg: number | null;
  subEarthLongitudeDeg: number | null;
}

export const getMoonSnapshot = (time: JulianDate = JulianDate.now()): MoonSnapshot => {
  const moonInertial = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(time, new Cartesian3());
  const sunInertial = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, new Cartesian3());
  const icrfToFixed = Transforms.computeIcrfToFixedMatrix(time) ?? Transforms.computeTemeToPseudoFixedMatrix(time);
  const moonFixed = icrfToFixed
    ? Matrix3.multiplyByVector(icrfToFixed, moonInertial, new Cartesian3())
    : moonInertial;

  const moonToSun = Cartesian3.subtract(sunInertial, moonInertial, new Cartesian3());
  const moonToEarth = Cartesian3.negate(moonInertial, new Cartesian3());
  const phaseAngle = Cartesian3.angleBetween(moonToSun, moonToEarth);
  const illuminatedFraction = (1 + Math.cos(phaseAngle)) / 2;

  const distanceFromEarthCenterKm = Cartesian3.magnitude(moonInertial) / 1000;
  const distanceFromEarthSurfaceKm = Math.max(0, distanceFromEarthCenterKm - EARTH_MEAN_RADIUS_KM - MOON_MEAN_RADIUS_KM);

  const subEarthPoint = Cartographic.fromCartesian(moonFixed, Ellipsoid.WGS84);

  return {
    time,
    distanceFromEarthCenterKm,
    distanceFromEarthSurfaceKm,
    illuminatedFraction,
    subEarthLatitudeDeg: subEarthPoint ? CesiumMath.toDegrees(subEarthPoint.latitude) : null,
    subEarthLongitudeDeg: subEarthPoint ? CesiumMath.toDegrees(subEarthPoint.longitude) : null,
  };
};
