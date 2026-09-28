// The geometry caches (resolve.ts `contextListing`, expand.ts occurrence
// reuse, the record index) key on object identity and assume a Project and
// everything in it is never mutated in place. Outside production builds the
// store freezes every project it takes in, so an in-place write throws
// (modules are strict mode) instead of silently serving stale geometry.

/** Freezes `value` and everything reachable from it; an already-frozen subtree is skipped (it was frozen whole), so re-freezing a project that shares most of its objects with the previous one stays cheap. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

/** `deepFreeze` outside production builds; the identity in production. */
export function freezeInDev<T>(value: T): T {
  return import.meta.env.MODE === 'production' ? value : deepFreeze(value)
}
