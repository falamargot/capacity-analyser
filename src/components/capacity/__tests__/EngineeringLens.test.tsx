import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EngineeringFocusProvider, type EngineeringFocusController } from '../../../contexts/EngineeringFocusContext';
import type { EngineeringTruth } from '../../../utils/engineeringAnalysisViewModel';
import { createEngineeringFocus } from '../../../utils/engineeringFocusModel';
import EngineeringResultSummary from '../shared/EngineeringResultSummary';

const truth: EngineeringTruth = {
  technology: 'LEO',
  topology: 'Site-to-Site',
  state: 'constrained',
  tone: 'warn',
  headline: 'Service available — constrained',
  summary: 'Beam sharing limits delivered service.',
  decisiveFactor: 'Beam sharing',
  primaryMetrics: [{ label: 'A → B throughput', value: 8, display: '8 Mbps', provenance: 'delivered' }],
  diagnosticMetrics: [],
  causeChain: [
    { id: 'scenario', label: 'Scenario', state: 'passed', summary: 'Ready' },
    { id: 'path', label: 'Path', state: 'passed', summary: 'Resolved' },
    { id: 'rf', label: 'RF', state: 'passed', summary: 'Closes', detail: '+11.7 dB' },
    { id: 'service', label: 'Service gates', state: 'passed', summary: 'Pass' },
    { id: 'delivery', label: 'Delivery', state: 'warning', summary: 'Beam sharing', detail: '188 Mbps → 8 Mbps' },
  ],
  nextAction: 'Inspect beam sharing',
};

const controller = (overrides: Partial<EngineeringFocusController> = {}): EngineeringFocusController => ({
  truths: { LEO: truth },
  focus: createEngineeringFocus('locked', 'LEO', 'delivery', 'globe'),
  preview: () => undefined,
  lock: () => undefined,
  clearPreview: () => undefined,
  clear: () => undefined,
  ...overrides,
});

describe('Engineering Cause Chain investigation', () => {
  it('renders the globe-selected stage as the only expanded accordion item', () => {
    const markup = renderToStaticMarkup(
      <EngineeringFocusProvider controller={controller()} truths={{ LEO: truth }}>
        <EngineeringResultSummary technology="LEO" truth={truth} />
      </EngineeringFocusProvider>,
    );

    expect(markup).toContain('data-engineering-lens-posture="reasoning"');
    expect(markup).toContain('Engineering cause chain');
    expect(markup).toContain('Delivery: Beam sharing. 188 Mbps → 8 Mbps. Collapse evidence.');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(markup).toContain('data-engineering-stage-evidence="delivery"');
    expect(markup).toContain('Globe path: selected focus');
    expect(markup).toContain('188 Mbps → 8 Mbps');
    expect(markup).not.toContain('Route view');
    expect(markup).not.toContain('Clear focus');
    expect(markup).not.toContain('>Summary<');
  });

  it('keeps the Summary posture compact while retaining the five-stage textual equivalent', () => {
    const markup = renderToStaticMarkup(
      <EngineeringFocusProvider
        controller={controller({ focus: { kind: 'none', technology: null, stageId: null, spatialTarget: null, origin: null } })}
        truths={{ LEO: truth }}
      >
        <EngineeringResultSummary technology="LEO" truth={truth} />
      </EngineeringFocusProvider>,
    );

    expect(markup).toContain('data-engineering-lens-posture="summary"');
    expect(markup).toContain('Scenario: Ready');
    expect(markup).toContain('Delivery: Beam sharing');
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(5);
    expect(markup).not.toContain('>188 Mbps → 8 Mbps<');
    expect(markup).not.toContain('Next investigation:');
  });

  it('embeds the existing proof component directly beneath its stage', () => {
    const markup = renderToStaticMarkup(
      <EngineeringFocusProvider
        controller={controller({ focus: createEngineeringFocus('locked', 'LEO', 'rf', 'lens') })}
        truths={{ LEO: truth }}
      >
        <EngineeringResultSummary
          technology="LEO"
          truth={truth}
          stageEvidence={{ rf: <section aria-label="Existing RF proof">Exact RF evidence</section> }}
        />
      </EngineeringFocusProvider>,
    );

    expect(markup).toContain('data-engineering-stage-evidence="rf"');
    expect(markup).toContain('Existing RF proof');
    expect(markup).toContain('Exact RF evidence');
    expect(markup).toContain('Link budget &amp; RF evidence');
    expect(markup).toContain('<details');
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1);
  });

  it('places the route answer before progressively disclosed hop evidence', () => {
    const markup = renderToStaticMarkup(
      <EngineeringFocusProvider
        controller={controller({ focus: createEngineeringFocus('locked', 'LEO', 'path', 'lens') })}
        truths={{ LEO: truth }}
      >
        <EngineeringResultSummary
          technology="LEO"
          truth={truth}
          stageSummaries={{ path: <dl aria-label="LEO route summary"><dt>Route</dt><dd>Site A → Satellite → SNP</dd></dl> }}
          stageEvidence={{ path: <section aria-label="Existing path proof">Hop evidence</section> }}
        />
      </EngineeringFocusProvider>,
    );

    expect(markup.indexOf('LEO route summary')).toBeLessThan(markup.indexOf('Major hops &amp; technical evidence'));
    expect(markup).toContain('Site A → Satellite → SNP');
    expect(markup).toContain('Existing path proof');
  });
});
