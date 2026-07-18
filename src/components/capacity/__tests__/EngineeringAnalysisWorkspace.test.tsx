import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineeringAnalysisViewModel } from '../../../utils/engineeringAnalysisViewModel';
import EngineeringAnalysisWorkspace from '../EngineeringAnalysisWorkspace';

const viewModel = (mode: 'GEO' | 'LEO') => ({ mode } as EngineeringAnalysisViewModel);

describe('EngineeringAnalysisWorkspace', () => {
  it.each(['GEO', 'LEO'] as const)('embeds existing %s proof without adding a second investigation shell', (mode) => {
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace viewModel={viewModel(mode)}>
        <section aria-label="Existing engineering evidence">Exact evidence</section>
      </EngineeringAnalysisWorkspace>,
    );

    expect(html).toContain(`data-engineering-embedded-evidence="${mode}"`);
    expect(html).toContain('Existing engineering evidence');
    expect(html).toContain('Exact evidence');
    expect(html).not.toContain('Detailed Investigation');
    expect(html).not.toContain('Close Analysis');
    expect(html).not.toContain('Expand link budget detail');
  });
});
