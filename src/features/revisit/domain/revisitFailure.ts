/**
 * revisitFailure — what actually went wrong, in a form the screen can rank.
 *
 * Before this module every failed computation reached the UI as a bare string:
 * whatever `Error.message` happened to say, or `event.message` from a Worker
 * error event, which in some browsers is empty. Two consequences, both seen in
 * the field:
 *
 *  1. the interface could not tell WHICH computation failed, so a failed
 *     comparison sweep raised the same blocking banner as an unanalysable
 *     scenario and stopped the whole demonstration;
 *  2. the engineer reading `Technical detail` could not tell an engine
 *     exception from a Worker crash from a Worker that was never constructed —
 *     the three have different causes and different fixes.
 *
 * A failure therefore carries four facts beyond its message: which operation
 * failed, which target it belonged to, which execution path produced it, and
 * what kind of fault it was. `describeRevisitFailure` renders them as one line:
 *
 *     Comparison target · Fleet sizing · Worker runtime error
 *
 * Nothing here formats for the customer. These strings are for the disclosure
 * an engineer opens, never for the headline the room reads.
 */

/** The computation that failed. Matches the vocabulary the UI already uses. */
export type RevisitOperation =
    | 'Analysis'
    | 'Fleet sizing'
    | 'Target comparison'
    | 'Area coverage';

/** Where it ran. The inline path is the documented no-Worker fallback. */
export type RevisitFailurePath = 'Worker' | 'Main thread';

/**
 * What kind of fault.
 *
 * - `engine error` — the analysis engine threw and the worker reported it
 *   through the protocol's `ok: false`. The message is the engine's own.
 * - `runtime error` — the Worker itself failed: a crash, an unhandled rejection
 *   or a module that would not load. The message may be empty; the label is
 *   then the only information there is, which is exactly why it exists.
 * - `unavailable` — no Worker could be constructed at all.
 * - `invalid input` — the request was rejected before any engine ran. Not a
 *   fault at all: the user asked for something the model cannot answer, and the
 *   message is the validator's own explanation.
 */
export type RevisitFailureKind =
    | 'engine error' | 'runtime error' | 'unavailable' | 'invalid input';

export interface RevisitFailure {
    operation: RevisitOperation;
    /** Which target the computation belonged to, or `null` when it has none. */
    target: string | null;
    path: RevisitFailurePath;
    kind: RevisitFailureKind;
    /** The raw engine or runtime message. Never shown without the label. */
    message: string;
}

/**
 * The part a producer knows about itself.
 *
 * A worker scheduler knows the path and the kind; only its caller knows which
 * operation and which target it was serving. Splitting the type this way keeps
 * the scheduler free of UI vocabulary.
 */
export type RevisitFailureCause = Pick<RevisitFailure, 'path' | 'kind' | 'message'>;

export function revisitFailure(
    cause: RevisitFailureCause,
    operation: RevisitOperation,
    target: string | null = null,
): RevisitFailure {
    return { ...cause, operation, target };
}

/** `Comparison target · Fleet sizing · Worker runtime error`. */
export function describeRevisitFailure(failure: RevisitFailure): string {
    return [failure.target, failure.operation, `${failure.path} ${failure.kind}`]
        .filter((part): part is string => Boolean(part))
        .join(' · ');
}

/**
 * The disclosure text: the label first, then the raw message when there is one.
 *
 * The label comes first deliberately. A Worker error event with an empty
 * message used to render an empty disclosure, which reads as "we do not know"
 * when in fact the interesting half — a Worker crashed rather than the engine
 * throwing — was known all along.
 */
export function revisitFailureDetail(failure: RevisitFailure): string {
    const label = describeRevisitFailure(failure);
    const message = failure.message.trim();
    return message ? `${label}\n${message}` : label;
}

/** Turn an unknown thrown value into a main-thread engine failure. */
export function inlineFailureCause(cause: unknown): RevisitFailureCause {
    return {
        path: 'Main thread',
        kind: 'engine error',
        message: cause instanceof Error ? cause.message : String(cause),
    };
}

/**
 * Does recovering from this failure require a new Worker?
 *
 * Only when the Worker is what broke. An `engine error` came back through the
 * protocol, which means the thread is alive and healthy — replacing it would
 * requeue and RESTART every other sweep in flight, so retrying one target would
 * silently reset another that was seconds from finishing.
 */
export function needsWorkerRestart(failure: RevisitFailure | null): boolean {
    return failure !== null && failure.kind !== 'engine error' && failure.kind !== 'invalid input';
}
