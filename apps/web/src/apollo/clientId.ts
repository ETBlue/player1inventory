/**
 * The tab id (households H3c-1, decision P4).
 *
 * One random id per page load. Both Apollo clients send it:
 *
 * - on every HTTP request, as the `x-client-id` header;
 * - when the live-updates socket opens, as `connectionParams.clientId`.
 *
 * The server uses it for one thing only: it does not send a change back to
 * the tab that made it. That tab already updates itself from the mutation
 * result, as it did before live updates. The id is not a secret and is never
 * trusted for anything else.
 *
 * The server accepts at most 64 characters (`CLIENT_ID_MAX_LENGTH` in
 * `apps/server/src/context.ts`). Both forms below give 36.
 */
export function makeClientId(
  cryptoImpl: Pick<Crypto, 'getRandomValues'> &
    Partial<Pick<Crypto, 'randomUUID'>> = crypto,
): string {
  // `crypto.randomUUID` exists only in a secure context: https, or
  // http://localhost. The dev server opened from a phone on the local
  // network (http://192.168.x.x) is NOT one, so `randomUUID` is undefined
  // there. `getRandomValues` works in every context, so it is the fallback.
  if (typeof cryptoImpl.randomUUID === 'function') {
    return cryptoImpl.randomUUID()
  }
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** This page load's tab id. Made once, when this module is first imported. */
export const CLIENT_ID = makeClientId()
