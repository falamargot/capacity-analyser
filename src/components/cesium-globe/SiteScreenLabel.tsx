import React, { useEffect, useRef } from 'react';
import { SceneTransforms, Viewer as CesiumViewerType, defined } from 'cesium';
import { getPosition } from './utils';
import { GROUND_POINT_ALTITUDE_KM } from './layerHeights';
import { formatCoordinates } from '../../utils/formatters';
import { ROUTE_REVEAL_TOTAL_MS } from './commercialAnimationDriver';

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
  collisionSide?: 'left' | 'right' | 'center';
  selectionMotionKey?: number;
  /**
   * When provided in commercial presentation, triggers a brief outcome glow
   * animation that plays once after the route reveal completes (Part F).
   * The glow colour matches the route status:
   *   active  → emerald
   *   limited → amber
   *   blocked → red
   */
  outcomeHighlight?: 'active' | 'limited' | 'blocked';
}

const toneClass = (tone?: SiteLabelTone): string => {
  if (tone === 'success') return 'text-emerald-300';
  if (tone === 'warning') return 'text-amber-300';
  if (tone === 'danger')  return 'text-red-400';
  return 'text-slate-300';
};

/** Returns the CSS glow color for the outcome highlight border animation. */
function outcomeGlowColor(status: 'active' | 'limited' | 'blocked'): string {
  switch (status) {
    case 'active':  return 'rgba(52, 211, 153, 0.55)'; // emerald-400
    case 'limited': return 'rgba(251, 191, 36, 0.55)'; // amber-400
    case 'blocked': return 'rgba(248,  113, 113, 0.55)'; // red-400
  }
}

/**
 * Inject the outcome-reveal keyframe once into the document head.
 * We use a data attribute to avoid duplicate <style> tags across re-renders.
 */
let outcomeStyleInjected = false;
function ensureOutcomeStyle(): void {
  if (outcomeStyleInjected) return;
  outcomeStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
@keyframes commercial-outcome-reveal {
  0%   { box-shadow: 0 0 0 2px var(--outcome-glow), 0 0 12px 2px var(--outcome-glow); }
  100% { box-shadow: none; }
}
`;
  document.head.appendChild(style);
}

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
  collisionSide = 'center',
  selectionMotionKey,
  outcomeHighlight,
}) => {
  const labelRef = useRef<HTMLDivElement | null>(null);
  const [selectionSettling, setSelectionSettling] = React.useState(false);

  useEffect(() => {
    if (!selectionMotionKey) return;
    setSelectionSettling(true);
    const timeout = window.setTimeout(() => setSelectionSettling(false), 320);
    return () => window.clearTimeout(timeout);
  }, [selectionMotionKey]);

  useEffect(() => {
    const viewer    = viewerRef.current;
    const container = containerRef.current;
    if (!viewer || !container || !position) return;

    const worldPosition = getPosition(position.lat, position.lng, GROUND_POINT_ALTITUDE_KM);

    const update = () => {
      const el = labelRef.current;
      const v  = viewerRef.current;
      const c  = containerRef.current;
      if (!el || !v || !c) return;
      const wp = SceneTransforms.worldToWindowCoordinates(v.scene, worldPosition);
      if (!defined(wp)) { el.style.opacity = '0'; return; }
      const { x, y } = wp;
      const inBounds = x >= -120 && y >= -80 && x <= c.clientWidth + 120 && y <= c.clientHeight + 80;
      if (!inBounds) { el.style.opacity = '0'; return; }
      const horizontalOffset = collisionSide === 'left' ? -30 : collisionSide === 'right' ? 30 : 0;
      const translateX = collisionSide === 'left' ? '-100%' : collisionSide === 'right' ? '0' : '-50%';
      el.style.opacity = '1';
      el.style.left    = `${x + horizontalOffset}px`;
      el.style.top     = `${y - (compact ? 22 : 28)}px`;
      el.style.transform = `translate(${translateX}, -100%)`;
    };

    update();
    viewer.scene.postRender.addEventListener(update);
    window.addEventListener('resize', update);
    return () => {
      viewer.scene.postRender.removeEventListener(update);
      window.removeEventListener('resize', update);
    };
  }, [collisionSide, compact, containerRef, position, viewerReady, viewerRef]);

  // Inject outcome keyframe once.
  if (presentation === 'commercial' && outcomeHighlight) {
    ensureOutcomeStyle();
  }

  if (!position || sections.length === 0) return null;

  // Outcome highlight animation (Part F):
  //   - Plays once on mount after a delay matching the route reveal sequence.
  //   - Duration 600 ms, ease-out, forwards fill (disappears cleanly).
  //   - Only on Site B in commercial mode when outcomeHighlight is provided.
  const highlightStyle: React.CSSProperties =
    presentation === 'commercial' && outcomeHighlight
      ? {
          '--outcome-glow': outcomeGlowColor(outcomeHighlight),
          animation: `commercial-outcome-reveal 600ms ease-out ${ROUTE_REVEAL_TOTAL_MS + 80}ms both`,
          borderRadius: compact ? '10px' : '4px',
        } as React.CSSProperties
      : {};

  return (
    <div
      ref={labelRef}
      className={['absolute z-50 pointer-events-none max-w-[18rem] opacity-0 transition-[opacity,transform] duration-150', selectionSettling ? 'endpoint-selection-label-settle' : ''].join(' ')}
      style={{ left: 0, top: 0, transform: 'translate(-50%, -100%)' }}
    >
      <div
        className={`${compact ? 'rounded-[10px] px-2.5 py-1.5' : 'rounded px-3 py-1.5'} bg-slate-950/72 text-white shadow-[0_16px_40px_-24px_rgba(0,0,0,0.86)] ring-1 ring-white/15 backdrop-blur-md`}
        style={highlightStyle}
      >
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
