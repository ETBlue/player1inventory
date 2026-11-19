/**
 * One write per key at a time (the H5b G.9 double-press finding, shared by
 * the location role hooks of households H5c and the purge hooks of H6).
 *
 * A confirm dialog closes at once, and the write and its reads take a
 * moment. A second call with the SAME key while the first runs gets the
 * first promise and sends nothing. A call with another key is sent: it is a
 * different change.
 *
 * Each module makes its own with `createOncePerKey()` and keeps it at module
 * level, not in a component, so a second mount of a page cannot start a
 * second write either.
 */
export function createOncePerKey() {
  const inFlight = new Map<string, Promise<unknown>>()
  return function once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const running = inFlight.get(key)
    if (running) return running as Promise<T>
    const promise = run().finally(() => {
      inFlight.delete(key)
    })
    inFlight.set(key, promise)
    return promise
  }
}
