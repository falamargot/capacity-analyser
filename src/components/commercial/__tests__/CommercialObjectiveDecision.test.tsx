import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CommercialScenarioViewModel } from '../commercialViewModel';
import {
  CommercialDecisionSummary,
  CommercialObjectiveControls,
  CommercialRecommendationEvidence,
} from '../CommercialObjectiveDecision';
import CustomerDecisionInspector, { EngineeringScoringBreakdown } from '../CustomerDecisionInspector';
import CustomerDecisionLauncher from '../CustomerDecisionLauncher';

function viewModel(overrides: Partial<CommercialScenarioViewModel> = {}): CommercialScenarioViewModel {
  return {
    commercialIntent: {
      objective: 'BACKUP',
      trafficDirection: 'BIDIRECTIONAL',
    },
    recommendation: {
      technology: 'insufficient_data',
      reasonCategory: 'INSUFFICIENT_DATA',
      label: 'Insufficient Data',
      chipLabel: 'Insufficient data',
      reason: 'Backup diversity needs the primary technology',
      message: 'Select the primary technology to assess backup diversity',
      expectedExperience: 'Waiting for comparable route evidence.',
      objective: 'BACKUP',
      assessmentBasis: 'relative_comparison',
      commonCriteria: ['latency'],
      nonComparableCriteria: ['regulatory sellability'],
      unknownCriteria: ['service diversity'],
    },
    comparison: {
      options: [
        {
          technology: 'leo',
          label: 'LEO',
          status: 'active',
          customerStatus: 'available',
          statusLabel: 'Available',
          available: true,
          strengths: [],
          evidence: {
            latency: {
              value: 42,
              unit: 'ms',
              nature: 'modeled',
              source: 'LEO link geometry (RTT)',
              asOf: null,
            },
          },
        },
      ],
      recommendation: {} as CommercialScenarioViewModel['recommendation'],
    },
    ...overrides,
  } as CommercialScenarioViewModel;
}

describe('CommercialObjectiveDecision', () => {
  it('renders a single selected customer objective and the required BACKUP primary input', () => {
    const html = renderToStaticMarkup(<CommercialObjectiveControls viewModel={viewModel()} />);

    expect(html).toContain('Customer priority');
    expect(html).toContain('Backup');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Select primary technology');
    expect(html).toContain('Relative planning comparison only');
  });

  it('renders traffic direction only for throughput-sensitive objectives', () => {
    const bulk = viewModel({
      commercialIntent: { objective: 'BULK', trafficDirection: 'DOWNLINK' },
    });
    const realtime = viewModel({
      commercialIntent: { objective: 'REALTIME', trafficDirection: 'BIDIRECTIONAL' },
    });

    expect(renderToStaticMarkup(<CommercialObjectiveControls viewModel={bulk} />)).toContain('Traffic direction');
    expect(renderToStaticMarkup(<CommercialObjectiveControls viewModel={realtime} />)).not.toContain('Traffic direction');
  });

  it('shows not-assessed confidence, comparison limits, and evidence provenance', () => {
    const html = renderToStaticMarkup(<CommercialRecommendationEvidence viewModel={viewModel()} />);

    expect(html).toContain('Why this recommendation');
    expect(html).toContain('Recommendation confidence');
    expect(html).toContain('Not assessed');
    expect(html).toContain('Relative comparison');
    expect(html).toContain('Not comparable:');
    expect(html).toContain('Unknown:');
    expect(html).toContain('Modeled · LEO link geometry (RTT)');
    expect(html).not.toMatch(/\d+(?:\.\d+)?% suitable/i);
  });

  it('shows the engineering scoring breakdown as relative shares, not suitability', () => {
    const model = viewModel({
      commercialIntent: { objective: 'REALTIME', trafficDirection: 'BIDIRECTIONAL' },
      recommendation: {
        technology: 'leo',
        reasonCategory: 'LOWEST_LATENCY',
        label: 'LEO',
        chipLabel: 'Recommended: LEO',
        reason: 'LEO scores higher for real-time traffic',
        message: 'LEO recommended over GEO',
        expectedExperience: 'Relative planning preference.',
        objective: 'REALTIME',
        assessmentBasis: 'relative_comparison',
        confidence: { level: 'Medium', score: 65, reasons: [] },
        technologyScores: [{
          technology: 'leo',
          relativeScore: 0.72,
          contributions: [{
            criterion: 'latency',
            weight: 5,
            rawValue: 42,
            share: 0.9,
            contribution: 0.64,
            nature: 'modeled',
          }],
        }],
      },
    });

    const html = renderToStaticMarkup(<EngineeringScoringBreakdown viewModel={model} />);
    expect(html).toContain('Scoring breakdown');
    expect(html).toContain('Relative share 0.720');
    expect(html).toContain('42 ms');
    expect(html).toContain('not service-fitness percentages');
    expect(html).not.toContain('72% suitable');
    expect(html).not.toContain('min-w-[30rem]');
  });

  it('renders decision controls in a dedicated inspector with separate sections', () => {
    const html = renderToStaticMarkup(
      <CustomerDecisionInspector viewModel={viewModel()} mode="engineering" onClose={() => undefined} />,
    );

    expect(html).toContain('Customer decision support');
    expect(html).toContain('Customer decision sections');
    expect(html).toContain('Priority');
    expect(html).toContain('Recommendation');
    expect(html).toContain('Evidence');
  });

  it('uses a compact read-only summary in contextual commercial panels', () => {
    const html = renderToStaticMarkup(<CommercialDecisionSummary viewModel={viewModel()} onOpen={() => undefined} />);

    expect(html).toContain('Decision support');
    expect(html).toContain('Backup / continuity');
    expect(html).toContain('Recommendation confidence: Not assessed');
    expect(html).toContain('Review');
    expect(html).not.toContain('Select primary technology');
  });

  it('exposes the current objective and not-assessed state from the header launcher', () => {
    const html = renderToStaticMarkup(
      <CustomerDecisionLauncher viewModel={viewModel()} open={false} onToggle={() => undefined} />,
    );

    expect(html).toContain('Decision support. Backup / continuity. Recommendation not assessed');
    expect(html).toContain('aria-expanded="false"');
  });
});
