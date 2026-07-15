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
  lensPosture: 'reasoning',
  surfaceMode: 'result',
  routeViewRequest: 0,
  preview: () => undefined,
  lock: () => undefined,
  clearPreview: () => undefined,
  clear: () => undefined,
  returnToRoute: () => undefined,
  setLensPosture: () => undefined,
  setSurfaceMode: () => undefined,
  ...overrides,
});

describe('Phase 3 Engineering Lens', () => {
  it('renders the canonical Cause Chain as keyboard-operable globe focus controls', () => {
    const markup = renderToStaticMarkup(
      <EngineeringFocusProvider controller={controller()} truths={{ LEO: truth }}>
        <EngineeringResultSummary technology="LEO" truth={truth} />
      </EngineeringFocusProvider>,
    );

    expect(markup).toContain('data-engineering-lens-posture="reasoning"');
    expect(markup).toContain('Engineering cause chain');
    expect(markup).toContain('Delivery: Beam sharing. 188 Mbps → 8 Mbps. Focused on globe.');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('Globe path: selected focus');
    expect(markup).toContain('Route view');
    expect(markup).toContain('188 Mbps → 8 Mbps');
  });

  it('keeps the Summary posture compact while retaining the five-stage textual equivalent', () => {
    const markup = renderToStaticMarkup(
      <EngineeringFocusProvider
        controller={controller({ focus: { kind: 'none', technology: null, stageId: null, spatialTarget: null, origin: null }, lensPosture: 'summary' })}
        truths={{ LEO: truth }}
      >
        <EngineeringResultSummary technology="LEO" truth={truth} />
      </EngineeringFocusProvider>,
    );

    expect(markup).toContain('data-engineering-lens-posture="summary"');
    expect(markup).toContain('Scenario: Ready');
    expect(markup).toContain('Delivery: Beam sharing');
    expect(markup).not.toContain('>188 Mbps → 8 Mbps<');
    expect(markup).not.toContain('Next investigation:');
  });
});
