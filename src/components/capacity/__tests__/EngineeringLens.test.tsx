// @vitest-environment jsdom

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EngineeringFocusProvider,
  type EngineeringFocusController,
  useEngineeringFocusController,
} from '../../../contexts/EngineeringFocusContext';
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
  autoFocusCamera: true,
  setAutoFocusCamera: () => undefined,
  ...overrides,
});

let mountedRoot: Root | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
  Element.prototype.scrollIntoView = () => undefined;
});

const renderLens = async (element: ReactElement, withInspectorHost = true) => {
  const container = document.createElement('div');
  const inspectorHost = document.createElement('div');
  inspectorHost.setAttribute('data-engineering-inspector-host', '');
  document.body.append(container);
  if (withInspectorHost) document.body.append(inspectorHost);
  mountedRoot = createRoot(container);
  await act(async () => { mountedRoot?.render(element); });
  return { container, inspectorHost };
};

afterEach(async () => {
  if (mountedRoot) await act(async () => { mountedRoot?.unmount(); });
  mountedRoot = null;
  document.body.replaceChildren();
});

const StatefulLens = () => {
  const focusController = useEngineeringFocusController();
  return (
    <EngineeringFocusProvider controller={focusController} truths={{ LEO: truth }}>
      <EngineeringResultSummary technology="LEO" truth={truth} />
    </EngineeringFocusProvider>
  );
};

describe('Engineering Cause Chain investigation', () => {
  it('renders the globe-selected stage in the attached Inspector, not inline', async () => {
    const { container, inspectorHost } = await renderLens(
      <EngineeringFocusProvider controller={controller()} truths={{ LEO: truth }}>
        <EngineeringResultSummary technology="LEO" truth={truth} />
      </EngineeringFocusProvider>,
    );

    expect(container.innerHTML).toContain('data-engineering-lens-posture="reasoning"');
    expect(container.innerHTML).toContain('Engineering cause chain');
    expect(container.innerHTML).toContain('Delivery: Beam sharing. 188 Mbps → 8 Mbps. Close Engineering Inspector.');
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-engineering-stage-evidence]')).toBeNull();
    expect(inspectorHost.querySelector('[data-engineering-inspector]')).not.toBeNull();
    expect(inspectorHost.querySelector('[data-engineering-stage-evidence="delivery"]')).not.toBeNull();
    expect(inspectorHost.textContent).toContain('188 Mbps → 8 Mbps');
    expect(inspectorHost.textContent).toContain('Next investigation: Inspect beam sharing');
    expect(inspectorHost.textContent).not.toContain('Route view');
  });

  it('keeps the Summary posture compact while retaining the five-stage textual equivalent', async () => {
    const { container, inspectorHost } = await renderLens(
      <EngineeringFocusProvider
        controller={controller({ focus: { kind: 'none', technology: null, stageId: null, spatialTarget: null, origin: null } })}
        truths={{ LEO: truth }}
      >
        <EngineeringResultSummary technology="LEO" truth={truth} />
      </EngineeringFocusProvider>,
    );

    expect(container.innerHTML).toContain('data-engineering-lens-posture="summary"');
    expect(container.innerHTML).toContain('Scenario: Ready');
    expect(container.innerHTML).toContain('Delivery: Beam sharing');
    expect(container.querySelectorAll('[aria-expanded="false"]')).toHaveLength(5);
    expect(container.textContent).not.toContain('188 Mbps → 8 Mbps');
    expect(inspectorHost.childElementCount).toBe(0);
  });

  it('moves the existing proof component into the Inspector without changing its content', async () => {
    const { container, inspectorHost } = await renderLens(
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

    expect(container.querySelector('[data-engineering-stage-evidence]')).toBeNull();
    expect(inspectorHost.querySelector('[data-engineering-stage-evidence="rf"]')).not.toBeNull();
    expect(inspectorHost.querySelector('[aria-label="Existing RF proof"]')).not.toBeNull();
    expect(inspectorHost.textContent).toContain('Exact RF evidence');
    expect(inspectorHost.textContent).not.toContain('Link Budget & RF Evidence');
    expect(inspectorHost.querySelector('details')).toBeNull();
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);
  });

  it('places the route answer before progressively disclosed hop evidence inside the Inspector', async () => {
    const { inspectorHost } = await renderLens(
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

    expect(inspectorHost.innerHTML.indexOf('LEO route summary')).toBeLessThan(inspectorHost.innerHTML.indexOf('Existing path proof'));
    expect(inspectorHost.textContent).toContain('Site A → Satellite → SNP');
    expect(inspectorHost.querySelector('[aria-label="Existing path proof"]')).not.toBeNull();
  });

  it('uses a stage-specific service decision view and progressively discloses secondary gate evidence', async () => {
    const serviceTruth: EngineeringTruth = {
      ...truth,
      causeChain: truth.causeChain.map((stage) => stage.id === 'service' ? {
        ...stage,
        detail: 'Traffic gateway capability permits the selected service',
        evidence: [
          { label: 'Gateway', value: 'Cagliari', state: 'passed' },
          { label: 'Capability', value: 'Traffic teleport', state: 'passed' },
          { label: 'Regulatory', value: 'Allowed', state: 'passed' },
          { label: 'Network load', value: 'Within plan', state: 'passed' },
          { label: 'Reference status', value: 'Estimated', state: 'warning' },
        ],
      } : stage),
    };
    const { inspectorHost } = await renderLens(
      <EngineeringFocusProvider
        controller={controller({
          truths: { LEO: serviceTruth },
          focus: createEngineeringFocus('locked', 'LEO', 'service', 'lens'),
        })}
        truths={{ LEO: serviceTruth }}
      >
        <EngineeringResultSummary technology="LEO" truth={serviceTruth} />
      </EngineeringFocusProvider>,
    );

    expect(inspectorHost.querySelector('.engineering-stage-composition--service')).not.toBeNull();
    expect(inspectorHost.textContent).toContain('Decision basis');
    expect(inspectorHost.textContent).toContain('Traffic gateway capability permits the selected service');
    expect(inspectorHost.querySelector('[data-engineering-secondary-investigation]:not([open])')).not.toBeNull();
  });

  it('keeps one Inspector mounted while switching stages and supports both close paths', async () => {
    const { container, inspectorHost } = await renderLens(<StatefulLens />);
    const deliveryButton = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.startsWith('Delivery:'));
    await act(async () => { deliveryButton?.click(); });

    const inspector = inspectorHost.querySelector('[data-engineering-inspector]');
    expect(inspector).not.toBeNull();
    expect(inspectorHost.textContent).toContain('Delivery');

    const rfButton = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.startsWith('RF:'));
    await act(async () => { rfButton?.click(); });
    expect(inspectorHost.querySelector('[data-engineering-inspector]')).toBe(inspector);
    expect(inspectorHost.textContent).toContain('RF');
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);

    await act(async () => { rfButton?.click(); });
    expect(inspector?.getAttribute('data-engineering-inspector-state')).toBe('closing');
    expect(rfButton?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => { deliveryButton?.click(); });
    const closeButton = inspectorHost.querySelector<HTMLButtonElement>('button[aria-label="Close Engineering Inspector"]');
    expect(closeButton).not.toBeNull();
    await act(async () => { closeButton?.click(); });
    expect(inspectorHost.querySelector('[data-engineering-inspector]')?.getAttribute('data-engineering-inspector-state')).toBe('closing');
  });

  it('uses a mobile bottom sheet with equivalent Cause Chain stage navigation when no desktop host exists', async () => {
    const { container } = await renderLens(<StatefulLens />, false);
    const deliveryButton = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.startsWith('Delivery:'));
    await act(async () => { deliveryButton?.click(); });

    const sheet = document.querySelector('[data-engineering-inspector].engineering-inspector-mobile');
    const stageNavigation = document.querySelector('nav[aria-label="Engineering Inspector Cause Chain stages"]');
    expect(sheet).not.toBeNull();
    expect(stageNavigation?.querySelectorAll('button')).toHaveLength(5);

    const pathButton = Array.from(stageNavigation?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('Path'));
    await act(async () => { pathButton?.click(); });
    expect(document.querySelector('[data-engineering-inspector]')).toBe(sheet);
    expect(document.querySelector('[data-engineering-inspector] h2')?.textContent).toBe('Path');
    // Path evidence is always displayed now — no collapsible disclosure wraps it.
    expect(document.querySelector('[data-engineering-stage-evidence="path"] details')).toBeNull();
  });
});
