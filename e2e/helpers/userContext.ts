import type { Browser, BrowserContext } from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'

/**
 * The `localStorage` key the E2E web build reads to act as another user.
 * Must match `E2E_USER_ID_STORAGE_KEY` in apps/web/src/lib/e2eUser.ts.
 */
export const E2E_USER_ID_STORAGE_KEY = 'e2e-user-id'

/** Options of `newUserContext`. Both default to `true`. */
export type UserContextOptions = {
  /**
   * Set `e2e-skip-onboarding`, so an empty catalog does not send every page
   * to `/onboarding`. Pass `false` to see what a real new person sees
   * (households H5b task G.10, Review Focus 1).
   */
  skipOnboarding?: boolean
  /**
   * Set `data-mode: cloud`. Pass `false` for a brand-new visitor: with no
   * `data-mode` key the app starts in LOCAL mode, as it does for a person
   * who opens the site for the first time.
   */
  cloudMode?: boolean
}

/**
 * A new browser context in which the cloud web app acts as `userId`
 * (households H5 task F.8, decision T10).
 *
 * The cloud web build has ONE build-time user (`VITE_E2E_TEST_USER_ID`). The
 * E2E build also reads `localStorage['e2e-user-id']`
 * (`getE2ETestUserId` in apps/web/src/lib/e2eUser.ts), and this context sets
 * it before the first page loads. A production build never reads the key.
 *
 * `browser.newContext` does NOT inherit the project's `use` settings, so this
 * sets them again: `baseURL`, `data-mode: cloud`, and `e2e-skip-onboarding`.
 * `options` can leave the last two out (households H5b task G.10). The
 * caller closes the context.
 *
 * The 409 rule of `addHouseholdMember` still applies: add a person to a
 * household BEFORE their context opens a page, because the first page sends
 * their first GraphQL request.
 */
export async function newUserContext(
  browser: Browser,
  userId: string,
  extraLocalStorage: { name: string; value: string }[] = [],
  options: UserContextOptions = {},
): Promise<BrowserContext> {
  const { skipOnboarding = true, cloudMode = true } = options
  return browser.newContext({
    baseURL: CLOUD_WEB_URL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: CLOUD_WEB_URL,
          localStorage: [
            ...(cloudMode ? [{ name: 'data-mode', value: 'cloud' }] : []),
            { name: E2E_USER_ID_STORAGE_KEY, value: userId },
            ...(skipOnboarding
              ? [{ name: 'e2e-skip-onboarding', value: 'true' }]
              : []),
            ...extraLocalStorage,
          ],
        },
      ],
    },
  })
}
