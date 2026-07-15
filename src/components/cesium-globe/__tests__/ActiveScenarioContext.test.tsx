import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ActiveScenarioContext from '../ActiveScenarioContext';

describe('ActiveScenarioContext', () => {
  it('renders independent GEO and LEO summaries without coordinates or engineering focus chrome', () => {
    const markup = renderToStaticMarkup(
      <ActiveScenarioContext
        geo={{
          status: 'resolved',
          satelliteName: 'EUTELSAT 10B',
          uplinkCoverage: 'UL Europe',
          downlinkCoverage: 'DL Europe',
        }}
        leo={{ status: 'resolved', satelliteNames: ['ONEWEB-A', 'ONEWEB-B'] }}
      />,
    );

    expect(markup).toContain('Active scenario context');
    expect(markup).toContain('UTC');
    expect(markup).toContain('EUTELSAT 10B');
    expect(markup).toContain('UL Europe');
    expect(markup).toContain('DL Europe');
    expect(markup).toContain('ONEWEB-A · ONEWEB-B');
    expect(markup).not.toContain('Position:');
    expect(markup).not.toContain('Locked engineering focus');
    expect(markup).not.toContain('Route view');
  });

  it('renders explicit failure placeholders and omits absent technologies', () => {
    const markup = renderToStaticMarkup(
      <ActiveScenarioContext geo={null} leo={{ status: 'no-rf-path' }} />,
    );

    expect(markup).not.toContain('GEO active scenario');
    expect(markup).toContain('LEO active scenario');
    expect(markup).toContain('No RF path');
  });
});
