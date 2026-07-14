import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EngineeringRecalculationStatus from '../EngineeringRecalculationStatus';

describe('EngineeringRecalculationStatus', () => {
  it('presents affected stages in the canonical Engineering Truth order', () => {
    const markup = renderToStaticMarkup(
      <EngineeringRecalculationStatus
        revision={3}
        status="updating"
        stages={['scenario', 'path', 'rf', 'service', 'delivery']}
        changedInputs={['GEO topology']}
      />,
    );

    expect(markup).toContain('Recalculating affected engineering stages');
    expect(markup).toContain('Rev 3');
    expect(markup).toContain('Scenario');
    expect(markup.indexOf('Scenario')).toBeLessThan(markup.indexOf('Path'));
    expect(markup.indexOf('Path')).toBeLessThan(markup.indexOf('RF closure'));
    expect(markup.indexOf('RF closure')).toBeLessThan(markup.indexOf('Service gates'));
    expect(markup.indexOf('Service gates')).toBeLessThan(markup.indexOf('Delivery'));
    expect(markup).toContain('Triggered by GEO topology');
  });

  it('announces the atomically published revision when recalculation settles', () => {
    const markup = renderToStaticMarkup(
      <EngineeringRecalculationStatus
        revision={4}
        status="settled"
        stages={['scenario', 'rf', 'service', 'delivery']}
        changedInputs={['Site A RF profile']}
      />,
    );

    expect(markup).toContain('Result revision updated');
    expect(markup).toContain('Rev 4');
  });
});
