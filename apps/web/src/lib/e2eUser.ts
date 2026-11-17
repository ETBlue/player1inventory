/**
 * The `localStorage` key an E2E spec sets to make one browser context act as
 * a different person (households H5 task F.8, decision T10).
 */
export const E2E_USER_ID_STORAGE_KEY = 'e2e-user-id'

/**
 * The user id the E2E build sends to the server, or `undefined` outside the
 * E2E build.
 *
 * - No `VITE_E2E_TEST_USER_ID` (every production build): `undefined`. The
 *   `localStorage` key is NOT read. Anyone can write `localStorage`, so
 *   reading it here would let a page pick its own user. The build-time value
 *   is a string constant, so Vite drops the read from a production bundle.
 * - The flag is set and the key holds a non-empty id: that id. This is how a
 *   two-browser spec makes each context a different person
 *   (`newUserContext` in `e2e/helpers/userContext.ts`).
 * - The flag is set and there is no key: the build-time id, as before.
 *
 * Read it once, before the first render (`main.tsx`), and pass it down. The
 * E2E server trusts whatever id it is sent, so the HTTP header, the live
 * socket and the screen must all use this one value.
 */
export function getE2ETestUserId(): string | undefined {
  const buildTimeId = import.meta.env.VITE_E2E_TEST_USER_ID as
    | string
    | undefined
  if (!buildTimeId) return undefined
  try {
    const stored = localStorage.getItem(E2E_USER_ID_STORAGE_KEY)
    if (stored) return stored
  } catch {
    // Storage blocked: fall back to the build-time id.
  }
  return buildTimeId
}
