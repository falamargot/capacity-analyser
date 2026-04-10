import { memo, useMemo } from 'react';
import { GEO_GATEWAYS, type GeoGatewayData } from './globe/GlobeConfig';
import type { SatelliteData } from '../types/satellites';
import { SectionTooltip } from './SectionTooltip';
import { getGroundSegmentRoutingForSatellite } from '../utils/geoConnectivityModel';

interface GatewayDetailsProps {
  gateway: GeoGatewayData;
  satellites: SatelliteData[];
  compactDesktop?: boolean;
  externalHeader?: boolean;
}

const formatRoleLabel = (role: string): string => role.replaceAll('_', ' ');

const formatOrbitalLongitude = (lng: number): string => {
  const normalized = ((((lng + 180) % 360) + 360) % 360) - 180;
  const direction = normalized < 0 ? 'W' : 'E';
  return `${Math.abs(normalized).toFixed(1)}°${direction}`;
};

const GatewayDetails = memo<GatewayDetailsProps>(({ gateway, satellites, compactDesktop = false, externalHeader = false }) => {
  const groundSegmentProfile = useMemo(() => {
    const operationalSatellites = satellites
      .filter((satellite) => satellite.orbitType === 'GEO' && satellite.type === 'EUTELSAT' && satellite.opsStatus === 'operational');

    const routing = operationalSatellites
      .map((satellite) => ({ satellite, routing: getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS) }))
      .filter((entry): entry is { satellite: SatelliteData; routing: NonNullable<ReturnType<typeof getGroundSegmentRoutingForSatellite>> } => entry.routing != null);

    const nominalSccSatellites = routing
      .filter(({ routing }) => routing.nominalScc?.name === gateway.name)
      .map(({ satellite }) => satellite)
      .sort((left, right) => left.name.localeCompare(right.name));

    const backupSccSatellites = routing
      .filter(({ routing }) => routing.backupScc?.name === gateway.name)
      .map(({ satellite }) => satellite)
      .sort((left, right) => left.name.localeCompare(right.name));

    const monitoredSatellites = routing
      .filter(({ routing }) => routing.monitoring.some((entry) => entry.name === gateway.name))
      .map(({ satellite }) => satellite)
      .sort((left, right) => left.name.localeCompare(right.name));

    const kaVerificationSatellites = monitoredSatellites.filter((satellite) => (
      satellite.name === 'EUTELSAT KONNECT' || satellite.name === 'EUTELSAT KONNECT VHTS'
    ));

    const touchedSatelliteMap = new Map<string, SatelliteData>();
    [...nominalSccSatellites, ...backupSccSatellites, ...monitoredSatellites].forEach((satellite) => {
      touchedSatelliteMap.set(satellite.id, satellite);
    });

    const touchedSatellites = Array.from(touchedSatelliteMap.values()).sort((left, right) => left.position.lng - right.position.lng);
    const orbitalArc = touchedSatellites.length > 0
      ? `${formatOrbitalLongitude(touchedSatellites[0].position.lng)} to ${formatOrbitalLongitude(touchedSatellites[touchedSatellites.length - 1].position.lng)}`
      : '--';

    const apacMonitoringCount = monitoredSatellites.filter((satellite) => satellite.position.lng >= 70 && satellite.position.lng <= 180).length;

    return {
      nominalSccSatellites,
      backupSccSatellites,
      monitoredSatellites,
      touchedSatellites,
      orbitalArc,
      kaVerificationSatellites,
      apacMonitoringCount,
    };
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

          <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 dark:border-cyan-500/20 dark:bg-cyan-500/10">
            <h3 className="flex items-center text-sm font-semibold text-cyan-800 dark:text-cyan-200">
              Gateway Identity
              <SectionTooltip content="Operational identity and routing posture for the selected GEO teleport." />
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-cyan-950 dark:text-cyan-50 sm:grid-cols-2">
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Code</span>
                <span className="font-semibold">{gateway.teleportCode}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Role</span>
                <span className="font-semibold">{formatRoleLabel(gateway.role)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Failover</span>
                <span className="font-semibold">500 ms / 5°</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Ka verification</span>
                <span className="font-semibold">{groundSegmentProfile.kaVerificationSatellites.length > 0 ? 'Enabled' : 'Not used'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-cyan-700 dark:text-cyan-200/80">Orbital arc</span>
                <span className="font-semibold">{groundSegmentProfile.orbitalArc}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <h3 className="mb-3 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
              Nominal SCC Satellites
            </h3>
            {groundSegmentProfile.nominalSccSatellites.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This teleport is not the nominal SCC for any operational GEO satellite.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groundSegmentProfile.nominalSccSatellites.map((satellite) => (
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
              Backup SCC Satellites
            </h3>
            {groundSegmentProfile.backupSccSatellites.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This teleport is not used as backup SCC for any operational GEO satellite.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groundSegmentProfile.backupSccSatellites.map((satellite) => (
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
              Monitored GEO Satellites
            </h3>
            {groundSegmentProfile.monitoredSatellites.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This teleport is not currently used as the nominal monitoring point for any operational GEO satellite.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groundSegmentProfile.monitoredSatellites.map((satellite) => (
                  <span
                    key={`monitoring-${satellite.id}`}
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-200"
                  >
                    {satellite.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {groundSegmentProfile.apacMonitoringCount > 0 && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="mb-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
                Continuity Notes
              </h3>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                APAC monitoring contribution: <span className="font-semibold text-gray-900 dark:text-gray-100">{groundSegmentProfile.apacMonitoringCount}</span> satellites
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

GatewayDetails.displayName = 'GatewayDetails';

export default GatewayDetails;
