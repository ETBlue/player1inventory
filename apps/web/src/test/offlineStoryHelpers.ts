import { MIGRATION_PROMPTED_KEY } from '@/hooks/usePostLoginMigration'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'

// Same key `apollo/persistence.ts` writes with `setLastSyncedAt` — not
// exported there, so it is repeated here. Keep the value format in sync:
// `String(date.getTime())`, read back with `Number(raw)`.
const LAST_SYNCED_AT_KEY = 'cloud-cache-last-synced-at'

// A couple of hours in the past, so the banner shows a real relative time
// ("2 hours ago") instead of "Showing no data".
const HOURS_AGO = 2

/**
 * Sets up a route story that shows `OfflineBanner` on a real page.
 *
 * Three things happen before the route renders:
 *  1. `localStorage['data-mode']` is set to `'cloud'` — `__root.tsx` only
 *     mounts the banner in cloud mode.
 *  2. `navigator.onLine` is forced to `false` — it is a getter, so it must be
 *     redefined, not assigned.
 *  3. A `lastSyncedAt` value is seeded a couple of hours in the past, so the
 *     banner reads "Showing data from 2 hours ago" instead of "Showing no
 *     data".
 *
 * It also sets `MIGRATION_PROMPTED_KEY`, so `PostLoginMigrationDialog` (also
 * mounted in cloud mode by `__root.tsx`) does not open on top of the page.
 * That dialog checks local Dexie for existing items on every cloud
 * sign-in, and every page reusing this helper seeds local Dexie data of its
 * own to have something to show — without this key the dialog would find
 * that data and open.
 *
 * Returns a cleanup function that undoes all of the above. Storybook does
 * not reload between stories, so the next story in the same session would
 * otherwise inherit cloud mode and a fixed-offline `navigator`.
 *
 * Use as a story's `beforeEach`:
 *   export const Offline: Story = {
 *     beforeEach: setupOfflineStory,
 *     render: () => <SomeStory />,
 *   }
 */
export function setupOfflineStory() {
  // Own property on `navigator` only — most environments define `onLine` as a
  // getter on `Navigator.prototype`, so this is usually `undefined`. Defining
  // an own property below then simply shadows the prototype getter, and
  // deleting that own property in cleanup uncovers it again untouched — the
  // prototype itself is never modified.
  const originalOwnOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine')

  localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
  localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
  localStorage.setItem(
    LAST_SYNCED_AT_KEY,
    String(Date.now() - HOURS_AGO * 60 * 60 * 1000),
  )

  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => false,
  })

  return () => {
    localStorage.removeItem(DATA_MODE_STORAGE_KEY)
    localStorage.removeItem(MIGRATION_PROMPTED_KEY)
    localStorage.removeItem(LAST_SYNCED_AT_KEY)
    if (originalOwnOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOwnOnLine)
    } else {
      // Restoring the prototype's own getter requires removing the
      // own-property shadow we added above.
      delete (navigator as { onLine?: boolean }).onLine
    }
  }
}
