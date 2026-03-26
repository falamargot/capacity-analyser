// satellite.js v7 re-exports its WASM runtime from the package root.
// Vite 8/Rolldown tries to bundle that path even though this app only uses
// the classic JavaScript propagation helpers, so we expose a JS-only facade.
export * as constants from '../../node_modules/satellite.js/dist/constants.js';
export { jday, invjday } from '../../node_modules/satellite.js/dist/ext.js';
export { twoline2satrec, json2satrec } from '../../node_modules/satellite.js/dist/io.js';
export { propagate, sgp4, gstime } from '../../node_modules/satellite.js/dist/propagation.js';
export { dopplerFactor } from '../../node_modules/satellite.js/dist/dopplerFactor.js';
export {
  radiansToDegrees,
  degreesToRadians,
  degreesLat,
  degreesLong,
  radiansLat,
  radiansLong,
  geodeticToEcf,
  eciToGeodetic,
  eciToEcf,
  ecfToEci,
  ecfToLookAngles
} from '../../node_modules/satellite.js/dist/transforms.js';
export { sunPos } from '../../node_modules/satellite.js/dist/sun.js';
export * from '../../node_modules/satellite.js/dist/shadow.js';
export { SatRecError } from '../../node_modules/satellite.js/dist/propagation/SatRec.js';
export type { SatRec } from '../../node_modules/satellite.js/dist/propagation/SatRec.js';
export * from '../../node_modules/satellite.js/dist/common-types.js';
