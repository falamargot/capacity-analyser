import React from 'react';

interface CrashBoundaryProps {
  children: React.ReactNode;
  title: string;
  description: string;
  resetLabel: string;
  /** Runs before the subtree remounts — e.g. clear the session that caused the crash. */
  onReset: () => void;
  exitLabel?: string;
  onExit?: () => void;
}

interface CrashBoundaryState {
  error: Error | null;
  recoveryKey: number;
}

/**
 * Last-resort containment, shared by every top-level mode: a malformed
 * restored session must not blank the whole app.
 *
 * `recoveryKey` on the wrapping Fragment forces a fresh mount of `children` on
 * reset, rather than resuming the instance that just crashed.
 */
export class CrashBoundary extends React.Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = { error: null, recoveryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<CrashBoundaryState> {
    return { error };
  }

  private handleReset = () => {
    this.props.onReset();
    this.setState((state) => ({ error: null, recoveryKey: state.recoveryKey + 1 }));
  };

  render() {
    const { children, title, description, resetLabel, exitLabel, onExit } = this.props;

    if (!this.state.error) {
      return <React.Fragment key={this.state.recoveryKey}>{children}</React.Fragment>;
    }

    return (
      <main className="flex h-dvh w-screen items-center justify-center bg-[#05070D] p-6 text-slate-100">
        <section className="w-full max-w-lg rounded-xl border border-red-400/40 bg-slate-900/95 p-5 shadow-2xl">
          <h1 className="text-lg font-black text-red-200">{title}</h1>
          <p className="mt-2 text-sm leading-5 text-slate-300">{description}</p>
          <p className="mt-2 break-words text-xs text-slate-500">{this.state.error.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="min-h-11 rounded-md bg-amber-400 px-4 text-sm font-black text-slate-950"
            >
              {resetLabel}
            </button>
            {exitLabel && onExit && (
              <button
                type="button"
                onClick={onExit}
                className="min-h-11 rounded-md border border-slate-600 px-4 text-sm font-bold text-slate-200"
              >
                {exitLabel}
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }
}

export default CrashBoundary;
