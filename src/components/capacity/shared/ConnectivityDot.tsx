/**
 * The technology tabs' connectivity indicator.
 *
 * S-7, WCAG 1.4.1 (Use of Color). This state used to be a coloured circle and
 * nothing else — green for a resolved SNP, amber for connectivity without one,
 * grey for none — on the most-used control in ENG and COMM. A viewer who cannot
 * separate those hues had no way to read it, and a screen reader was told
 * nothing at all.
 *
 * Colour is kept, because it is the fastest channel for everyone who can use
 * it, and TWO non-colour channels are added beside it:
 *
 *   - SHAPE: filled disc (ready) / ring (partial) / faint hollow dot (none).
 *     Perceivable in greyscale and at a glance.
 *   - TEXT: an accessible name on the dot, so the state is announced rather
 *     than skipped.
 *
 * Deliberately not an icon font or an emoji: both change line-height in this
 * tab strip, and the tab's own label is doing the naming work already.
 */

export type ConnectivityDotState = 'ready' | 'partial' | 'none';

const LABEL: Record<ConnectivityDotState, string> = {
  ready: 'connected',
  partial: 'partial — no gateway path',
  none: 'no connectivity',
};

const SHAPE: Record<ConnectivityDotState, string> = {
  // Filled disc.
  ready: 'bg-green-400 border border-green-400',
  // Ring: same footprint, hollow centre.
  partial: 'bg-transparent border-2 border-yellow-400',
  // Faint hollow dot.
  none: 'bg-transparent border border-gray-400 dark:border-slate-500',
};

export function ConnectivityDot({
  state,
  technology,
}: {
  state: ConnectivityDotState;
  technology: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${technology}: ${LABEL[state]}`}
      title={`${technology}: ${LABEL[state]}`}
      className={`h-2 w-2 flex-shrink-0 rounded-full ${SHAPE[state]}`}
    />
  );
}
