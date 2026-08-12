import React from 'react';
import { CrashBoundary } from './CrashBoundary';
import { clearTelecomSessionSnapshot } from '../../state/session/telecomSessionSnapshot';

interface Props {
  children: React.ReactNode;
  onSwitchToRevisit?: () => void;
}

/** Last-resort containment: a malformed restored session must not blank the whole app. */
export const TelecomErrorBoundary: React.FC<Props> = ({ children, onSwitchToRevisit }) => (
  <CrashBoundary
    title="Something went wrong"
    description="The restored session or one of its parameters is invalid. Reset the session to continue."
    resetLabel="Reset session"
    onReset={clearTelecomSessionSnapshot}
    exitLabel={onSwitchToRevisit ? 'Switch to REVISIT' : undefined}
    onExit={onSwitchToRevisit && (() => {
      // Symmetric with RevisitErrorBoundary: leaving via this button — not
      // Reset — must still discard the snapshot that caused the crash.
      // Otherwise the user escapes to REVISIT, returns to ENG/COMM, and the
      // same faulty session is rehydrated into the same crash.
      clearTelecomSessionSnapshot();
      onSwitchToRevisit();
    })}
  >
    {children}
  </CrashBoundary>
);

export default TelecomErrorBoundary;
