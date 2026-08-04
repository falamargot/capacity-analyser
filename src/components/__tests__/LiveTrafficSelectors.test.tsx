import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AircraftSelector from '../AircraftSelector';
import VesselSelector from '../VesselSelector';

const label = 'Unavailable during time simulation';
const reason = 'Live traffic is unavailable while scenario time is simulated. Return to current time to enable it.';

describe('live traffic selectors during time simulation', () => {
  it('disables aircraft selection and explains how to restore the feed', () => {
    const markup = renderToStaticMarkup(
      <AircraftSelector
        aircraft={[]}
        onSelect={() => undefined}
        liveModeEnabled={false}
        onToggleLiveMode={() => undefined}
        disabled
        disabledLabel={label}
        disabledReason={reason}
      />,
    );

    expect(markup).toContain(label);
    expect(markup).toContain(reason);
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
  });

  it('disables vessel selection and explains how to restore the feed', () => {
    const markup = renderToStaticMarkup(
      <VesselSelector
        vessels={[]}
        onSelect={() => undefined}
        liveModeEnabled={false}
        onToggleLiveMode={() => undefined}
        disabled
        disabledLabel={label}
        disabledReason={reason}
      />,
    );

    expect(markup).toContain(label);
    expect(markup).toContain(reason);
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
  });

  it('keeps the Site B prerequisite message when the clock is live', () => {
    // Site B is disabled for two independent reasons — no Site A yet, or a
    // simulated clock. In LIVE mode the field must still say what to do about
    // the reason that actually applies, not blame the clock.
    const markup = renderToStaticMarkup(
      <AircraftSelector
        aircraft={[]}
        onSelect={() => undefined}
        liveModeEnabled
        onToggleLiveMode={() => undefined}
        disabled
        disabledLabel={undefined}
        disabledReason={undefined}
        placeholder="Select Site A first"
        showLiveToggle={false}
      />,
    );

    expect(markup).toContain('Select Site A first');
    expect(markup).not.toContain(label);
    expect(markup).not.toContain(reason);
  });

  it('blames the clock for Site B once the scenario time is simulated', () => {
    const markup = renderToStaticMarkup(
      <AircraftSelector
        aircraft={[]}
        onSelect={() => undefined}
        liveModeEnabled={false}
        onToggleLiveMode={() => undefined}
        disabled
        disabledLabel={label}
        disabledReason={reason}
        placeholder="Select Site B aircraft..."
        showLiveToggle={false}
      />,
    );

    expect(markup).toContain(label);
    expect(markup).toContain(reason);
  });
});
