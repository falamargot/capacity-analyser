import React from 'react';
import { MARKER_STYLE, type GeoGatewayMarkerKind } from './geoGatewayMarkerModel';

const LEGEND_ITEMS: Array<{ kind: GeoGatewayMarkerKind; label: string; detail: string }> = [
  { kind: 'TRAFFIC_TELEPORT', label: 'Traffic Teleport', detail: 'eligible STAR RF endpoint' },
  { kind: 'SATELLITE_CONTROL', label: 'SCC outline', detail: 'satellite control capability' },
  { kind: 'MONITORING', label: 'Monitoring', detail: 'operations visibility only' },
  { kind: 'TTC', label: 'TT&C', detail: 'tracking / telemetry / command' },
];

const GeoGroundSiteLegend: React.FC = () => (
  <div className="pointer-events-none absolute bottom-20 right-3 z-20 w-[230px] max-w-[calc(100vw-1rem)] rounded-lg border border-slate-700/75 bg-slate-950/82 p-2.5 text-slate-100 shadow-[0_18px_44px_-28px_rgba(2,6,23,0.9)] ring-1 ring-white/8 backdrop-blur-md">
    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/90">GEO Ground Sites</div>
    <div className="mt-2 space-y-1.5">
      {LEGEND_ITEMS.map((item) => {
        const style = MARKER_STYLE[item.kind];
        return (
          <div key={item.kind} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border-2"
              style={{ backgroundColor: style.fill, borderColor: style.outline }}
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold leading-tight text-white">{item.label}</span>
              <span className="block text-[9px] leading-tight text-slate-300">{item.detail}</span>
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

export default React.memo(GeoGroundSiteLegend);
