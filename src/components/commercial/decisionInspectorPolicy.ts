import type { EngineeringFocusKind } from '../../utils/engineeringFocusModel';

/**
 * Decision Support and the Engineering cause-chain inspector share one desktop
 * host. Close Decision Support only for a NEW engineering lock. A lock that was
 * already present when the launcher is clicked is cleared by the launcher and
 * must not make the opening click appear to be ignored.
 */
export function shouldCloseDecisionInspectorForFocusTransition(
  open: boolean,
  previousFocusKind: EngineeringFocusKind,
  currentFocusKind: EngineeringFocusKind,
): boolean {
  return open && previousFocusKind !== 'locked' && currentFocusKind === 'locked';
}
