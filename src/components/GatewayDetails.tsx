import { memo, useMemo } from 'react';
import { GEO_GATEWAYS, type GeoGatewayData } from './globe/GlobeConfig';
import type { SatelliteData } from '../types/satellites';
import { SectionTooltip } from './SectionTooltip';
import { getAssignedGeoSatellitesForGateway } from '../utils/geoConnectivityModel';

interface GatewayDetailsProps {
  gateway: GeoGatewayData;
  satellites: SatelliteData[];
  compactDesktop?: boolean;
  externalHeader?: boolean;
}

const GatewayDetails = memo<GatewayDetailsProps>(({ gateway, satellites, compactDesktop = false, externalHeader = false }) => {
  const assignedGeoSatellites = useMemo(() => {
    return getAssignedGeoSatellitesForGateway(gateway, satellites, GEO_GATEWAYS);
  }, [gateway.name, satellites]);

  return (
    <div className="h-full overflow-hidden rounded-lg bg-white shadow-lg transition-colors duration-300 dark:bg-slate-900">
      <div className={`flex h-full flex-col overflow-y-auto ${compactDesktop ? 'p-3.5' : 'p-4'}`}>
        <div className={compactDesktop ? 'space-y-3.5' : 'space-y-4'}>
          {!externalHeader && (
            <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="h-3 w-3 rounded-full bg-cyan-500 shadow-lg shadow-cyan-400/50" />
                <div>
                  <h2 className={`font-bold text-gray-900 dark:text-gray-100 ${compactDesktop ? 'text-xl' : 'text-2xl'}`}>Gateway Details</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {gateway.name} · {gateway.region}
                  </p>
                </div>
              </div>
              <span className={`rounded-full bg-cyan-100 font-medium text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-200 ${compactDesktop ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>
                GEO Gateway
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">Region</h3>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{gateway.region}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">Gateway ID</h3>
              <p className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{gateway.gateway_id}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">Latitude</h3>
              <p className="font-mono text-lg font-semibold text-gray-900 dark:text-gray-100">{gateway.lat.toFixed(4)}°</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">Longitude</h3>
              <p className="font-mono text-lg font-semibold text-gray-900 dark:text-gray-100">{gateway.lng.toFixed(4)}°</p>
            </div>
          </div>

          <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 dark:border-cyan-500/20 dark:bg-cyan-500/10">
            <h3 className="flex items-center text-sm font-semibold text-cyan-800 dark:text-cyan-200">
              Ground Segment Role
              <SectionTooltip content="A GEO gateway is the teleport that links the selected geostationary satellite beam to the terrestrial network." />
            </h3>
            <div className="mt-2 space-y-1 text-sm text-cyan-950 dark:text-cyan-50">
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Node type</span>
                <span className="font-semibold">Teleport / GEO gateway</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Primary GEO satellites</span>
                <span className="font-semibold">{assignedGeoSatellites.primary.length}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Backup GEO satellites</span>
                <span className="font-semibold">{assignedGeoSatellites.backup.length}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Total assigned GEO satellites</span>
                <span className="font-semibold">{assignedGeoSatellites.primary.length + assignedGeoSatellites.backup.length}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <h3 className="mb-3 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
              Primary GEO Satellites
            </h3>
            {assignedGeoSatellites.primary.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No primary GEO satellite is currently assigned to this gateway.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignedGeoSatellites.primary.map((satellite) => (
                  <span
                    key={`primary-${satellite.id}`}
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-200"
                  >
                    {satellite.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <h3 className="mb-3 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
              Backup GEO Satellites
            </h3>
            {assignedGeoSatellites.backup.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No backup GEO satellite is currently assigned to this gateway.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignedGeoSatellites.backup.map((satellite) => (
                  <span
                    key={`backup-${satellite.id}`}
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-200"
                  >
                    {satellite.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <h3 className="mb-3 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
              Assignment Model
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manual primary and backup assignments are used for gateway monitoring in order to stay aligned with operational expectations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

GatewayDetails.displayName = 'GatewayDetails';

export default GatewayDetails;
