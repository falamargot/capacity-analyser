import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { Satellite, Plane, Ship, Radio } from 'lucide-react';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { Vessel } from '../../modules/maritimeTraffic/maritimeTrafficService';
import type { GeoGatewayData, SNPData } from '../globe/GlobeConfig';

type HoveredEntity =
  | { type: 'satellite'; data: SatelliteData }
  | { type: 'aircraft'; data: Aircraft }
  | { type: 'vessel'; data: Vessel }
  | { type: 'snp'; data: SNPData }
  | { type: 'gateway'; data: GeoGatewayData }
  | null;

interface InspectionCardProps {
  entity: HoveredEntity;
  /** Globe container element for positioning bounds */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const FADE_DELAY_MS = 150;

const InspectionCard = memo<InspectionCardProps>(({ entity, containerRef }) => {
  const [visible, setVisible] = useState(false);
  const [displayEntity, setDisplayEntity] = useState<HoveredEntity>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDisplayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);

  const updatePosition = useCallback(() => {
    frameRef.current = null;

    const container = containerRef.current;
    const card = cardRef.current;
    if (!container || !card) return;

    const cardWidth = card.offsetWidth || 240;
    const cardHeight = card.offsetHeight || 100;
    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight || 600;

    let left = mousePosRef.current.x + 16;
    let top = mousePosRef.current.y - 10;

    if (left + cardWidth > containerWidth - 8) {
      left = mousePosRef.current.x - cardWidth - 16;
    }
    if (top + cardHeight > containerHeight - 8) {
      top = mousePosRef.current.y - cardHeight + 10;
    }

    left = Math.max(8, left);
    top = Math.max(8, top);

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }, [containerRef]);

  // Track mouse position only while the inspection card is active.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !displayEntity) return;

    const handler = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (frameRef.current == null) {
        frameRef.current = requestAnimationFrame(updatePosition);
      }
    };

    container.addEventListener('mousemove', handler);
    return () => {
      container.removeEventListener('mousemove', handler);
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [containerRef, displayEntity, updatePosition]);

  // Show/hide with debounce to prevent flicker
  useEffect(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (clearDisplayTimeout.current) clearTimeout(clearDisplayTimeout.current);

    if (entity) {
      setDisplayEntity(entity);
      setVisible(true);
      if (frameRef.current == null) {
        frameRef.current = requestAnimationFrame(updatePosition);
      }
    } else {
      hideTimeout.current = setTimeout(() => {
        setVisible(false);
        // Clear display entity after fade-out
        clearDisplayTimeout.current = setTimeout(() => setDisplayEntity(null), 200);
      }, FADE_DELAY_MS);
    }

    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      if (clearDisplayTimeout.current) clearTimeout(clearDisplayTimeout.current);
    };
  }, [entity, updatePosition]);

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  if (!displayEntity) return null;

  const renderContent = () => {
    switch (displayEntity.type) {
      case 'satellite': {
        const s = displayEntity.data;
        return (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <Satellite className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">Orbit</span>
              <span className="text-gray-700 dark:text-gray-300">{s.orbitType} · {s.type}</span>
              <span className="text-gray-500 dark:text-gray-400">Alt</span>
              <span className="text-gray-700 dark:text-gray-300">{s.position.alt?.toFixed(0) ?? '—'} km</span>
              <span className="text-gray-500 dark:text-gray-400">Lat/Lng</span>
              <span className="text-gray-700 dark:text-gray-300">{s.position.lat.toFixed(2)}° / {s.position.lng.toFixed(2)}°</span>
            </div>
          </>
        );
      }
      case 'aircraft': {
        const a = displayEntity.data;
        return (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <Plane className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{a.callsign || a.icao24}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">ICAO24</span>
              <span className="text-gray-700 dark:text-gray-300">{a.icao24}</span>
              <span className="text-gray-500 dark:text-gray-400">Alt</span>
              <span className="text-gray-700 dark:text-gray-300">{a.altitude_km != null ? `${a.altitude_km.toFixed(1)} km` : '—'}</span>
              <span className="text-gray-500 dark:text-gray-400">Speed</span>
              <span className="text-gray-700 dark:text-gray-300">{a.speed_kmh != null ? `${a.speed_kmh.toFixed(0)} km/h` : '—'}</span>
            </div>
          </>
        );
      }
      case 'vessel': {
        const v = displayEntity.data;
        return (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <Ship className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{v.name || v.mmsi}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">Type</span>
              <span className="text-gray-700 dark:text-gray-300">{v.vesselType}</span>
              <span className="text-gray-500 dark:text-gray-400">Speed</span>
              <span className="text-gray-700 dark:text-gray-300">{v.speed != null ? `${v.speed.toFixed(1)} kn` : '—'}</span>
              {v.destination && <>
                <span className="text-gray-500 dark:text-gray-400">Dest</span>
                <span className="text-gray-700 dark:text-gray-300 truncate">{v.destination}</span>
              </>}
            </div>
          </>
        );
      }
      case 'snp': {
        const snp = displayEntity.data;
        return (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <Radio className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{snp.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">Region</span>
              <span className="text-gray-700 dark:text-gray-300">{snp.region}</span>
              <span className="text-gray-500 dark:text-gray-400">Lat/Lng</span>
              <span className="text-gray-700 dark:text-gray-300">{snp.lat.toFixed(2)}° / {snp.lng.toFixed(2)}°</span>
            </div>
          </>
        );
      }
      case 'gateway': {
        const gateway = displayEntity.data;
        return (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <Radio className="h-3.5 w-3.5 text-cyan-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{gateway.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">Type</span>
              <span className="text-gray-700 dark:text-gray-300">GEO Gateway</span>
              <span className="text-gray-500 dark:text-gray-400">Region</span>
              <span className="text-gray-700 dark:text-gray-300">{gateway.region}</span>
              <span className="text-gray-500 dark:text-gray-400">Lat/Lng</span>
              <span className="text-gray-700 dark:text-gray-300">{gateway.lat.toFixed(2)}° / {gateway.lng.toFixed(2)}°</span>
            </div>
          </>
        );
      }
    }
  };

  return (
    <div
      ref={cardRef}
      className={`absolute z-30 pointer-events-none transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ left: 8, top: 8, width: 240 }}
    >
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-lg shadow-lg border border-gray-200/80 dark:border-slate-700/80 px-3 py-2.5">
        {renderContent()}
      </div>
    </div>
  );
});

InspectionCard.displayName = 'InspectionCard';
export type { HoveredEntity };
export default InspectionCard;
