import React from 'react';
import { CrashBoundary } from '../../../components/errors/CrashBoundary';
import { clearRevisitSessionSnapshot } from '../state/revisitSessionSnapshot';

interface Props {
  children: React.ReactNode;
  onExit?: () => void;
}

/** Last-resort containment: a malformed scene must not blank the whole app. */
export const RevisitErrorBoundary: React.FC<Props> = ({ children, onExit }) => (
  <CrashBoundary
    title="REVISIT could not render this scenario"
    description="The saved scenario or one of its parameters is invalid. Reset REVISIT to its verified reference profile and try again."
    resetLabel="Reset REVISIT"
    onReset={clearRevisitSessionSnapshot}
    exitLabel={onExit ? 'Back to telecom analysis' : undefined}
    onExit={onExit && (() => {
      // The crash already persisted whatever scenario caused it (RevisitApp's
      // unmount effect writes unconditionally). Leaving via this button — not
      // Reset — must still discard it, or re-entering REVISIT reads the same
      // broken scenario back and crashes again immediately.
      clearRevisitSessionSnapshot();
      onExit();
    })}
  >
    {children}
  </CrashBoundary>
);

export default RevisitErrorBoundary;
