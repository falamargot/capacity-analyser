import React from 'react';
import { Viewer as CesiumViewerType } from 'cesium';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import SiteScreenLabel from './SiteScreenLabel';
import { buildLeoS2SSectionA, buildLeoS2SSectionB } from './siteTooltipHelpers';

interface LeoS2SScreenLabelsProps {
  viewerRef: React.RefObject<CesiumViewerType | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Full S2S result (with throughput/latency). Structural-only result shows "--" for perf values. */
  result: LeoSiteToSiteResult;
  viewerReady?: boolean;
}

const LeoS2SScreenLabels: React.FC<LeoS2SScreenLabelsProps> = ({
  viewerRef,
  containerRef,
  result,
  viewerReady = false,
}) => (
  <>
    <SiteScreenLabel
      siteId="A"
      position={result.endpointA}
      viewerRef={viewerRef}
      containerRef={containerRef}
      viewerReady={viewerReady}
      sections={[buildLeoS2SSectionA(result)]}
    />
    <SiteScreenLabel
      siteId="B"
      position={result.endpointB}
      viewerRef={viewerRef}
      containerRef={containerRef}
      viewerReady={viewerReady}
      sections={[buildLeoS2SSectionB(result)]}
    />
  </>
);

export default React.memo(LeoS2SScreenLabels);
