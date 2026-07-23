import { describe, expect, it } from 'vitest';
import { shouldCloseDecisionInspectorForFocusTransition } from '../decisionInspectorPolicy';

describe('Decision inspector ownership policy', () => {
  it('does not cancel the opening click while an existing engineering lock is being cleared', () => {
    expect(shouldCloseDecisionInspectorForFocusTransition(true, 'locked', 'locked')).toBe(false);
    expect(shouldCloseDecisionInspectorForFocusTransition(true, 'locked', 'none')).toBe(false);
  });

  it('yields the shared inspector host to a newly selected engineering stage', () => {
    expect(shouldCloseDecisionInspectorForFocusTransition(true, 'none', 'locked')).toBe(true);
    expect(shouldCloseDecisionInspectorForFocusTransition(true, 'preview', 'locked')).toBe(true);
  });

  it('does nothing while Decision Support is closed', () => {
    expect(shouldCloseDecisionInspectorForFocusTransition(false, 'none', 'locked')).toBe(false);
  });
});
