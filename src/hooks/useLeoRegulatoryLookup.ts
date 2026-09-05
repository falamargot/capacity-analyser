import { useEffect, useState } from 'react';
import { regulatoryLookup, type RegulatoryResult } from '../services/regulatoryService';

/**
 * Regulatory status of the two route endpoints (S-2 slice: MOVED out of
 * `App.tsx`, not rewritten — same effects, same dependency arrays).
 *
 * Site B is looked up only in LEO site-to-site: outside that topology there is
 * no second endpoint to clear, and the result is reset to null rather than left
 * stale, exactly as before.
 */
export function useLeoRegulatoryLookup({
  activeAnalysisPoint,
  pointBLeo,
  leoTopologyMode,
}: {
  activeAnalysisPoint: { lat: number; lng: number } | null | undefined;
  pointBLeo: { lat: number; lng: number } | null | undefined;
  leoTopologyMode: string;
}) {
  const [leoRegulatoryResult, setLeoRegulatoryResult] = useState<RegulatoryResult | null>(null);
  const [leoRegulatoryResultB, setLeoRegulatoryResultB] = useState<RegulatoryResult | null>(null);

  useEffect(() => {
    if (!activeAnalysisPoint) {
      setLeoRegulatoryResult(null);
      return;
    }
    let cancelled = false;
    setLeoRegulatoryResult(null);
    regulatoryLookup(activeAnalysisPoint.lat, activeAnalysisPoint.lng).then((result) => {
      if (!cancelled) setLeoRegulatoryResult(result);
    });
    return () => { cancelled = true; };
  }, [activeAnalysisPoint]);

  useEffect(() => {
    if (!pointBLeo || leoTopologyMode !== 'SITE_TO_SITE') {
      setLeoRegulatoryResultB(null);
      return;
    }
    let cancelled = false;
    setLeoRegulatoryResultB(null);
    regulatoryLookup(pointBLeo.lat, pointBLeo.lng).then((result) => {
      if (!cancelled) setLeoRegulatoryResultB(result);
    });
    return () => { cancelled = true; };
  }, [leoTopologyMode, pointBLeo]);

  return { leoRegulatoryResult, leoRegulatoryResultB };
}
