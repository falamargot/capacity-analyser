import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../../types/analysis';
import CoverageSelector from '../../CoverageSelector';
import { SectionTooltip } from '../../SectionTooltip';
import CollapsibleSection from '../../layout/CollapsibleSection';

const candidate = (satelliteId: string, isUplink: boolean): CandidateCoverage => ({
  satelliteId,
  satelliteName: `Satellite ${satelliteId}`,
  missionName: 'Ku',
  coverageKey: `${satelliteId}:${isUplink ? 'ul' : 'dl'}`,
  coverageName: `${satelliteId} ${isUplink ? 'uplink' : 'downlink'}`,
  beamId: `${satelliteId}:beam`,
  beamName: 'Europe',
  elevation: 35,
  distanceFromBeamCenter: 0,
  throughputEstimate: 100,
  level: isUplink ? 8 : 52,
  isUplink,
  isSynthesized: false,
  band: 'Ku',
  atmosphericLossDb: 1,
  slantRangeKm: 38_000,
  fsplDb: 200,
  cn0Dbhz: 70,
  cnDb: 10,
  linkMarginDb: satelliteId === 'A' ? 5 : 3,
  latencyMs: 120,
  status: 'available',
  score: satelliteId === 'A' ? 2 : 1,
  scoreBreakdown: { elevation: 0, linkMargin: 0, throughput: 0, latency: 0, total: 0 },
});

describe('Phase 3 interaction primitives', () => {
  it('makes the full collapsible header one labelled disclosure control', () => {
    const markup = renderToStaticMarkup(
      <CollapsibleSection storageKey="test-radio-path" title="Radio Path" defaultOpen={false}>
        Evidence
      </CollapsibleSection>,
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls=');
    expect(markup).toContain('aria-label="Expand Radio Path"');
  });

  it('uses a native contextual info button with popup relationships', () => {
    const markup = renderToStaticMarkup(<SectionTooltip content="Defines RF closure." />);

    expect(markup).toContain('<button');
    expect(markup).toContain('aria-label="Information: Defines RF closure."');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls=');
  });

  it('publishes complete combobox trigger semantics for GEO path selection', () => {
    const candidates = [candidate('A', true), candidate('A', false), candidate('B', true), candidate('B', false)];
    const markup = renderToStaticMarkup(
      <CoverageSelector
        candidateCoverages={candidates}
        linkMode="STAR_FORWARD"
        selectedDownlinkCoverage={candidates[1]}
        onSelectDownlinkCoverage={() => undefined}
      />,
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Serving satellite selection"');
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
