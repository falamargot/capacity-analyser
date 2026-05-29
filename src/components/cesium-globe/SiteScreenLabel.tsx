import React, { useEffect, useRef } from 'react';
import { SceneTransforms, Viewer as CesiumViewerType, defined } from 'cesium';
import { getPosition } from './utils';
import { GROUND_POINT_ALTITUDE_KM } from './layerHeights';
import { formatCoordinates } from '../../utils/formatters';

export type SiteLabelTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface SiteLabelLine {
  text: string;
  tone?: SiteLabelTone;
}

export interface SiteLabelSection {
  title: string;
  connectedSatelliteName?: string;
  accent: 'blue' | 'pink';
  lines: SiteLabelLine[];
}

interface SiteScreenLabelProps {
  siteId: 'A' | 'B';
  position: { lat: number; lng: number } | null;
  viewerRef: React.RefObject<CesiumViewerType | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewerReady?: boolean;
  compact?: boolean;
  sections: SiteLabelSection[];
  titleOverride?: string;
  presentation?: 'engineering' | 'commercial';
}

const toneClass = (tone?: SiteLabelTone): string => {
  if (tone === 'success') return 'text-emerald-300';
  if (tone === 'warning') return 'text-amber-300';
  if (tone === 'danger') return 'text-red-400';
  return 'text-slate-300';
};

const SiteScreenLabel: React.FC<SiteScreenLabelProps> = ({
  siteId,
  position,
  viewerRef,
  containerRef,
  viewerReady = false,
  compact = false,
  sections,
  titleOverride,
  presentation = 'engineering',
}) => {
  const labelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    const container = containerRef.current;
    if (!viewer || !container || !position) return;

    const worldPosition = getPosition(position.lat, position.lng, GROUND_POINT_ALTITUDE_KM);

    const update = () => {
      const el = labelRef.current;
      const v = viewerRef.current;
      const c = containerRef.current;
      if (!el || !v || !c) return;
      const wp = SceneTransforms.worldToWindowCoordinates(v.scene, worldPosition);
      if (!defined(wp)) { el.style.opacity = '0'; return; }
      const { x, y } = wp;
      const inBounds = x >= -120 && y >= -80 && x <= c.clientWidth + 120 && y <= c.clientHeight + 80;
      if (!inBounds) { el.style.opacity = '0'; return; }
      el.style.opacity = '1';
      el.style.left = `${x}px`;
      el.style.top = `${y - (compact ? 22 : 28)}px`;
    };

    update();
    viewer.scene.postRender.addEventListener(update);
    window.addEventListener('resize', update);
    return () => {
      viewer.scene.postRender.removeEventListener(update);
      window.removeEventListener('resize', update);
    };
  }, [compact, containerRef, position, viewerReady, viewerRef]);

  if (!position || sections.length === 0) return null;

  return (
    <div
      ref={labelRef}
      className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-full opacity-0"
      style={{ left: 0, top: 0 }}
    >
      <div className={`${compact ? 'rounded-[10px] px-2.5 py-1.5' : 'rounded px-3 py-1.5'} bg-slate-900/85 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm`}>
        <div className={`${compact ? 'text-[11px]' : 'text-[12px] sm:text-sm'} font-semibold leading-tight ${presentation === 'commercial' ? 'text-white' : 'text-cyan-300'} mb-0.5`}>
          {titleOverride ?? `Site ${siteId} · ${formatCoordinates(position)}`}
        </div>
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-1.5 pt-1.5 border-t border-white/10' : ''}>
            <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${section.accent === 'blue' ? 'text-sky-400' : 'text-pink-400'}`}>
              <span>{section.title}</span>
              {section.connectedSatelliteName && (
                <span className="ml-1.5 text-slate-300 normal-case tracking-normal">
                  · {section.connectedSatelliteName}
                </span>
              )}
            </div>
            {section.lines.map((line, li) => (
              <div
                key={li}
                className={`${compact ? 'text-[10px]' : 'text-[11px] sm:text-[12px]'} font-semibold leading-tight ${toneClass(line.tone)}`}
              >
                {line.text}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(SiteScreenLabel);
