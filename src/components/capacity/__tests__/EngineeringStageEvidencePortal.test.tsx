// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EngineeringFocusProvider, type EngineeringFocusController } from '../../../contexts/EngineeringFocusContext';
import type { EngineeringTruth } from '../../../utils/engineeringAnalysisViewModel';
import { createEngineeringFocus, EMPTY_ENGINEERING_FOCUS } from '../../../utils/engineeringFocusModel';
import EngineeringResultSummary from '../shared/EngineeringResultSummary';
import EngineeringStageEvidencePortal from '../shared/EngineeringStageEvidencePortal';

/**
 * M0 parity freeze for the stage-evidence portal contract.
 *
 * The sections feed deep evidence into the lens through
 * `[data-engineering-stage-evidence-host="TECH:stage"]`, resolved with a
 * document query after mount. These tests pin that contract — evidence must
 * appear inside the expanded stage exactly when that stage is locked — so the
 * M2 migration (direct rendering instead of portals) has an executable
 * definition of "no evidence lost".
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const truth: EngineeringTruth = {
  technology: 'LEO',
  topology: 'Single Site',
  state: 'constrained',
  tone: 'warn',
  headline: 'Service available — constrained',
  summary: 'Beam sharing limits delivered service.',
  decisiveFactor: 'Beam sharing',
  primaryMetrics: [{ label: 'Downlink throughput', value: 18, display: '18 Mbps', provenance: 'delivered' }],
  diagnosticMetrics: [],
  causeChain: [
    { id: 'scenario', label: 'Scenario', state: 'passed', summary: 'Ready' },
    { id: 'path', label: 'Path', state: 'passed', summary: 'Resolved' },
    { id: 'rf', label: 'RF', state: 'passed', summary: 'Closes', detail: '+11.7 dB' },
    { id: 'service', label: 'Service gates', state: 'passed', summary: 'Pass' },
    { id: 'delivery', label: 'Delivery', state: 'warning', summary: 'Beam sharing' },
  ],
};

const controller = (overrides: Partial<EngineeringFocusController> = {}): EngineeringFocusController => ({
  truths: { LEO: truth },
  focus: EMPTY_ENGINEERING_FOCUS,
  lensPosture: 'summary',
  surfaceMode: 'result',
  preview: () => undefined,
  lock: () => undefined,
  clearPreview: () => undefined,
  clear: () => undefined,
  setLensPosture: () => undefined,
  setSurfaceMode: () => undefined,
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const renderLensWithPortal = (focusController: EngineeringFocusController) => {
  act(() => {
    root.render(
      <EngineeringFocusProvider controller={focusController} truths={{ LEO: truth }}>
        <EngineeringResultSummary technology="LEO" truth={truth} />
        <EngineeringStageEvidencePortal technology="LEO" stage="rf">
          <section aria-label="Deep RF evidence">Deep RF evidence body</section>
        </EngineeringStageEvidencePortal>
      </EngineeringFocusProvider>,
    );
  });
};

describe('EngineeringStageEvidencePortal parity contract', () => {
  it('teleports the evidence into the locked stage host inside the lens', () => {
    renderLensWithPortal(controller({ focus: createEngineeringFocus('locked', 'LEO', 'rf', 'lens') }));

    const host = document.querySelector('[data-engineering-stage-evidence-host="LEO:rf"]');
    expect(host).not.toBeNull();
    expect(host?.textContent).toContain('Deep RF evidence body');
    const expandedStage = document.querySelector('[data-engineering-stage-evidence="rf"]');
    expect(expandedStage?.contains(host)).toBe(true);
  });

  it('renders no evidence when no stage is locked', () => {
    renderLensWithPortal(controller());

    expect(document.body.textContent).not.toContain('Deep RF evidence body');
    expect(document.querySelector('[data-engineering-stage-evidence-host="LEO:rf"]')).toBeNull();
  });

  it('keeps evidence out of a different locked stage and removes it on stage switch', () => {
    renderLensWithPortal(controller({ focus: createEngineeringFocus('locked', 'LEO', 'rf', 'lens') }));
    expect(document.body.textContent).toContain('Deep RF evidence body');

    renderLensWithPortal(controller({ focus: createEngineeringFocus('locked', 'LEO', 'service', 'lens') }));
    expect(document.body.textContent).not.toContain('Deep RF evidence body');
    expect(document.querySelector('[data-engineering-stage-evidence-host="LEO:service"]')).not.toBeNull();
    expect(document.querySelector('[data-engineering-stage-evidence-host="LEO:rf"]')).toBeNull();
  });

  it('does not leak evidence across technologies', () => {
    act(() => {
      root.render(
        <EngineeringFocusProvider
          controller={controller({ focus: createEngineeringFocus('locked', 'GEO', 'rf', 'lens') })}
          truths={{ LEO: truth }}
        >
          <EngineeringResultSummary technology="LEO" truth={truth} />
          <EngineeringStageEvidencePortal technology="LEO" stage="rf">
            <section aria-label="Deep RF evidence">Deep RF evidence body</section>
          </EngineeringStageEvidencePortal>
        </EngineeringFocusProvider>,
      );
    });

    expect(document.body.textContent).not.toContain('Deep RF evidence body');
  });
});
