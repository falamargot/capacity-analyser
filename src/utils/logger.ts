/**
 * Conditional logger — active only in development builds.
 * Use this instead of bare console.log to keep production console clean. (§3.1)
 */
const IS_DEV = import.meta.env.DEV;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const log = IS_DEV ? console.log.bind(console) : (..._args: any[]) => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const warn = IS_DEV ? console.warn.bind(console) : (..._args: any[]) => {};
