/**
 * Conditional logger — active only in development builds.
 * Use this instead of bare console.log to keep production console clean. (§3.1)
 */
const IS_DEV = import.meta.env.DEV;

 
export const log = IS_DEV ? console.log.bind(console) : (..._args: any[]) => {};
 
export const warn = IS_DEV ? console.warn.bind(console) : (..._args: any[]) => {};
