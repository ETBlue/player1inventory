import { expect, test } from '@playwright/test'
import { checkA11y, getViolations, injectAxe } from 'axe-playwright'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { seedRows } from '../helpers/locationSeed'
import { StockPagerPage } from '../pages/StockPagerPage'

// WCAG AA target: 4.5:1 contrast ratio for normal text, 3:1 for large text.
// Explicitly set runOnly so future tooling and AI agents know the intended level.
const AXE_OPTIONS = {
  runOnly: { type: 'tag' as const, values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
}

// KNOWN PRE-EXISTING DEFECT — the filled destructive button (`variant="destructive"`,
// used for the confirm action inside the SHARED `DeleteButton`) fails contrast.
//
//   Criterion: WCAG 2.1 SC 1.4.3 Contrast (Minimum), Level AA — 4.5:1 for NORMAL text.
//              The button is `text-sm` (14px) `font-medium` (500), which is normal
//              text, not large (large = 18pt/24px, or 14pt/18.66px bold), so the 3:1
//              large-text allowance does not apply.
//              NOT SC 1.4.11 (non-text contrast): the button against the dialog
//              surface measures 3.78:1 light / 5.28:1 dark, both clearing that 3:1
//              bar. Do not cite 1.4.11 for this.
//   Measured:  3.92:1 light (axe: #f7f1f4 on #ac6185) · ~4.09:1 dark (modelled).
//
// ROOT CAUSE IS **`opacity-90`** ON THE `buttonVariants` BASE CLASS
// (`apps/web/src/components/ui/button.tsx:13`) — not the colour token. Every button
// in the app renders at 90%, so background AND label composite over the dialog
// surface; #f7f1f4 is simply white at 90% over #ac6185. The token itself PASSES as
// authored — `--importance-destructive-background` gives 5.20:1 light and 4.71:1
// dark — so re-darkening it would be the wrong repair and would restyle every
// destructive surface in the app. The button also passes on `hover:opacity-100`; it
// fails only at rest. (`disabled:opacity-50` is fine — disabled controls are exempt
// from 1.4.3.)
//
// Pre-existing and app-wide, not introduced here: reproduced identically on the
// Settings › Locations delete dialog, which predates the Stock-tab pager. It went
// unreported because no a11y test in the repo had ever opened a delete confirmation.
// The user has ruled the fix a follow-up on its own branch with its own visual review.
//
// SCOPE: this excludes the element from the **`color-contrast` rule only** (see
// `checkA11yAllowingKnownConfirmContrast` below), not from every rule. `button-name`,
// `target-size` and the aria rules still police that button. Excluding it outright
// would also hide any FUTURE violation on it.
//
// REMOVAL CONDITION — checkable: once `opacity-90` is removed/raised on the
// `buttonVariants` base class (or the confirm button opts out of it), delete this
// constant, delete `checkA11yAllowingKnownConfirmContrast`, and change both call
// sites back to `checkA11y(page, undefined, AXE_OPTIONS)`; the two dialog tests pass
// unaided once the composite clears 4.5:1. Note an `exclude` is silent — it will not
// announce the fix, so this has to be revisited deliberately.
const KNOWN_CONFIRM_CONTRAST_EXCLUSION = {
  exclude: [['.bg-importance-destructive-background']],
}

// KNOWN PRE-EXISTING DEFECT — `UnitBadge` (`.opacity-75` on the shared badge
// component, `src/components/shared/UnitBadge/UnitBadge.tsx`) fails contrast.
// Documented in `apps/web/src/components/CLAUDE.md` ("Unit Display
// Components" — "opacity-75 is intentional for visual harmony; it reduces
// contrast to ~2.97:1 (below WCAG AA for small text) — accepted tradeoff by
// design"), i.e. this is a KNOWN, ALREADY-ACCEPTED tradeoff, not a new defect.
//
//   Criterion: WCAG 2.1 SC 1.4.3 Contrast (Minimum), Level AA — 4.5:1 for
//              NORMAL text (the badge is `text-xs`, not large text).
//   Root cause: `opacity-75` on the badge composites its already-muted
//              `text-foreground-muted` further into the page background.
//
// It went unreported until the 2026-08-27 review (Important 1): ItemForm's
// Stock tab used to pass an empty string through to the badge for an item
// with no `packageUnit` configured, so axe never found visible TEXT to check
// contrast against. Fixing that bug (the badge now honestly renders the
// literal fallback "unit" — see `getStockPreview` in `lib/quantityUtils.ts`)
// gave axe a real text node to flag, on the two fixtures below that render an
// unconfigured item's stock preview in light mode. Both dark-mode equivalents
// pass unaided — `foreground-muted`'s dark-mode contrast clears the bar even
// at this opacity — so only the light-mode call sites need this exclusion.
//
// SCOPE: excludes `.opacity-75` from the **`color-contrast` rule only**, same
// pattern as `KNOWN_CONFIRM_CONTRAST_EXCLUSION` above — every other rule
// (`button-name`, `target-size`, the aria rules, …) still polices these
// elements, and a future FIX to the badge's contrast is not hidden by this,
// only a regression elsewhere on the same page would be.
//
// REMOVAL CONDITION — checkable: once `UnitBadge` stops applying an opacity
// that drops it below 4.5:1 (e.g. the accepted-tradeoff note in
// `components/CLAUDE.md` is revisited), delete this constant and
// `checkA11yAllowingKnownBadgeContrast`, and change the call sites back to
// `checkA11y(page, undefined, AXE_OPTIONS)` / `checkA11yAllowingKnownConfirmContrast`.
const KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION = {
  exclude: [['.opacity-75']],
}

// Two scans instead of one, so a known defect is excluded from a single RULE
// rather than from every rule on that element.
//
// These use `getViolations`, not `checkA11y`, deliberately. `checkA11y`'s third
// parameter is axe-playwright's own `AxeOptions` WRAPPER and it forwards only
// `axeOptions.axeOptions` to axe — so handing it a bare axe `RunOptions` (as the 60
// sibling scans in this file do with `AXE_OPTIONS`) silently runs axe with its
// DEFAULTS and the option object has no effect. `getViolations(page, context,
// runOptions)` takes `RunOptions` directly, so rule selection here actually applies.
// The two scans below therefore cover the same effective rule set as the siblings
// (axe defaults), minus one rule on the given elements.
async function checkA11yExcludingContrastOn(
  page: import('@playwright/test').Page,
  exclude: string[][],
  label: string,
) {
  // 1. Every rule EXCEPT color-contrast, with nothing excluded — the excluded
  //    element(s) are still policed for accessible name, target size, aria
  //    validity and the rest.
  const nonContrast = await getViolations(page, undefined, {
    rules: { 'color-contrast': { enabled: false } },
  })
  expect(
    nonContrast.map((v) => v.id),
    'non-contrast a11y violations',
  ).toEqual([])

  // 2. color-contrast alone, excluding only the known-bad element(s) — so a
  //    contrast regression anywhere else on the page still fails the test.
  const contrast = await getViolations(
    page,
    { exclude },
    { runOnly: { type: 'rule', values: ['color-contrast'] } },
  )
  expect(contrast.flatMap((v) => v.nodes.map((n) => n.target.join(' '))), label).toEqual(
    [],
  )
}

async function checkA11yAllowingKnownConfirmContrast(
  page: import('@playwright/test').Page,
) {
  await checkA11yExcludingContrastOn(
    page,
    KNOWN_CONFIRM_CONTRAST_EXCLUSION.exclude,
    'color-contrast violations outside the known destructive confirm button',
  )
}

async function checkA11yAllowingKnownBadgeContrast(
  page: import('@playwright/test').Page,
) {
  await checkA11yExcludingContrastOn(
    page,
    KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION.exclude,
    'color-contrast violations outside the known UnitBadge opacity issue',
  )
}

// The remove-from-location dialog carries BOTH known issues at once: its own
// destructive confirm button, plus the item's stock preview (with the same
// unconfigured `packageUnit` fixture) rendered behind it on the Stock tab.
async function checkA11yAllowingKnownConfirmAndBadgeContrast(
  page: import('@playwright/test').Page,
) {
  await checkA11yExcludingContrastOn(
    page,
    [
      ...KNOWN_CONFIRM_CONTRAST_EXCLUSION.exclude,
      ...KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION.exclude,
    ],
    'color-contrast violations outside the known destructive confirm button and UnitBadge opacity issue',
  )
}

// Prevent the empty-data redirect to /onboarding so tests can navigate to any
// page without being intercepted. Onboarding tests set this key themselves.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete all test data from the database via the E2E cleanup endpoint.
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
    return
  }
  // Local mode: clear IndexedDB, localStorage, and sessionStorage.
  // Navigate to the app origin so IndexedDB API is accessible, then clear all databases.
  // We must stay on the same origin to call indexedDB.databases().
  // Use onblocked to force-close any lingering connections before the delete proceeds.
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(
      dbs.map(({ name }) => {
        return new Promise<void>((resolve, reject) => {
          if (!name) {
            resolve()
            return
          }
          const req = indexedDB.deleteDatabase(name)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
          // If existing connections block deletion, the blocked event fires.
          // We resolve anyway since the app will be reset on next navigation.
          req.onblocked = () => {
            console.warn(
              `[afterEach] IndexedDB delete blocked for "${name}" — data may persist`,
            )
            resolve()
          }
        })
      }),
    )
    localStorage.clear()
    sessionStorage.clear()
  })
})

// Pantry page (/)
test('user can view pantry page without accessibility violations', async ({ page }) => {
  // Given the user navigates to the pantry (home) page
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Desktop sidebar LocationSwitcher (variant="full").
// Every desktop scan in this file runs at 1280×720 and so already includes the
// sidebar switcher — but none of them *proves* it was on screen, so a regression
// that dropped it would leave them all green. This test asserts the trigger is
// visible first, then scans, pinning the coverage.
//
// It deliberately does NOT scan with the dropdown open: Radix's modal portal
// marks the rest of the page `aria-hidden` and renders the menu outside every
// landmark, which trips `aria-hidden-focus`, `landmark-one-main`, `region` and
// `page-has-heading-one`. Those are Radix `DropdownMenu` artifacts shared by
// every menu in the app, not anything specific to this component, and chasing
// them here would just add a fifth known failure to this file.
test('user can view the desktop sidebar location switcher without accessibility violations', async ({
  page,
}) => {
  // Given the pantry page at a desktop viewport, where the sidebar switcher shows
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(
    page
      .getByRole('navigation', { name: 'Sidebar navigation' })
      .getByRole('button', { name: /switch location/i }),
  ).toBeVisible()

  // When axe scans the page with the switcher present
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Shopping page (/shopping)
test('user can view shopping page without accessibility violations', async ({ page }) => {
  // Given the user navigates to the shopping page
  await page.goto('/shopping')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Shopping > Vendor cart page (/shopping/:vendorId)
test('user can view vendor cart page without accessibility violations', async ({ page }) => {
  // Given a seeded vendor
  const vendorId = await seedVendor(page)

  // Navigate to the vendor's cart page
  await page.goto(`/shopping/${vendorId}`)
  await page.waitForLoadState('networkidle')
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Cooking page (/cooking)
test('user can view cooking page without accessibility violations', async ({ page }) => {
  // Given seeded recipe cards covering both stock-status states
  await seedCookingFixture(page)

  // Navigate to the cooking page, waiting until the unavailable card has
  // rendered so a seeding failure fails here rather than silently scanning
  // an empty page
  await page.goto('/cooking')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('0 / 2 here')).toBeVisible()

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Settings main page (/settings)
test('user can view settings page without accessibility violations', async ({ page }) => {
  // Given the user navigates to the settings page
  await page.goto('/settings')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Settings > Tags list (/settings/tags)
test('user can view settings tags list without accessibility violations', async ({ page }) => {
  // Given the user navigates to the tags settings page
  await page.goto('/settings/tags')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Settings > Vendors list (/settings/vendors)
test('user can view settings vendors list without accessibility violations', async ({ page }) => {
  // Given the user navigates to the vendors settings page
  await page.goto('/settings/vendors')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Settings > Recipes list (/settings/recipes)
test('user can view settings recipes list without accessibility violations', async ({ page }) => {
  // Given the user navigates to the recipes settings page
  await page.goto('/settings/recipes')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Shelves group-by view (/?groupBy=shelf)
test('user can view shelves page without accessibility violations', async ({ page }) => {
  // Given the user navigates to the pantry page in shelf group-by mode
  await page.goto('/?groupBy=shelf')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Vendor group-by view (/?groupBy=vendor)
test('user can view vendor group-by page without accessibility violations', async ({ page }) => {
  // Given a seeded vendor with an item linked to it
  const vendorId = await seedVendor(page)
  await page.evaluate(async (vId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('items', 'readwrite')
      tx.objectStore('items').add({
        id,
        name: 'vendor item',
        tagIds: [],
        vendorIds: [vId],
        recipeIds: [],
        targetQuantity: 1,
        refillThreshold: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, vendorId)

  // When the user navigates to the vendor group-by view
  await page.goto('/?groupBy=vendor')
  await page.waitForLoadState('networkidle')
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Recipe group-by view (/?groupBy=recipe)
test('user can view recipe group-by page without accessibility violations', async ({ page }) => {
  // Given a seeded recipe with an item linked to it
  const recipeId = await seedRecipe(page)
  await page.evaluate(async (rId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const itemId = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['items', 'recipes'], 'readwrite')
      tx.objectStore('items').add({
        id: itemId,
        name: 'recipe item',
        tagIds: [],
        vendorIds: [],
        recipeIds: [rId],
        targetQuantity: 1,
        refillThreshold: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      const recipeStore = tx.objectStore('recipes')
      const getReq = recipeStore.get(rId)
      getReq.onsuccess = () => {
        const recipe = getReq.result
        recipe.items = [{ itemId, defaultAmount: 1, consumeAmount: 1 }]
        recipeStore.put(recipe)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, recipeId)

  // When the user navigates to the recipe group-by view
  await page.goto('/?groupBy=recipe')
  await page.waitForLoadState('networkidle')
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Settings > Shelves list (/settings/shelves)
test('user can view settings shelves list without accessibility violations', async ({ page }) => {
  // Given the user navigates to the shelves settings page
  await page.goto('/settings/shelves')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Settings > Locations list (/settings/locations)
test('user can view settings locations list without accessibility violations', async ({ page }) => {
  // Given the user navigates to the locations settings page
  await page.goto('/settings/locations')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Onboarding page (/onboarding)
test('user can view onboarding page without accessibility violations', async ({ page }) => {
  // Given the user navigates directly to the onboarding page
  // Use a seeded item to prevent the empty-data redirect intercepting /onboarding
  // and sending us back to pantry. The skip flag prevents the redirect but we also
  // need data so the onboarding page doesn't auto-redirect itself.
  await page.goto('/onboarding')
  // Wait for the URL and a unique onboarding element to confirm the page rendered
  await page.waitForURL('**/onboarding', { timeout: 10000 })
  await page.getByRole('button', { name: 'Choose from a template...' }).waitFor({ timeout: 10000 })

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page, undefined, AXE_OPTIONS)
})

// Helper: seed an item into IndexedDB and return its ID
async function seedItem(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('items', 'readwrite')
      tx.objectStore('items').add({
        id,
        name: 'test item',
        tagIds: [],
        vendorIds: [],
        recipeIds: [],
        targetQuantity: 1,
        refillThreshold: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return id
  })
}

// Helper: seed a tag type + tag into IndexedDB and return the tag ID
async function seedTag(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const typeId = crypto.randomUUID()
    const tagId = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['tagTypes', 'tags'], 'readwrite')
      tx.objectStore('tagTypes').add({ id: typeId, name: 'test type', color: 'blue', createdAt: new Date() })
      tx.objectStore('tags').add({ id: tagId, name: 'test tag', tagTypeId: typeId, createdAt: new Date() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return tagId
  })
}

// Helper: seed a vendor into IndexedDB and return its ID
async function seedVendor(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('vendors', 'readwrite')
      tx.objectStore('vendors').add({ id, name: 'test vendor', createdAt: new Date() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return id
  })
}

// Helper: seed a shelf into IndexedDB and return its ID
async function seedShelf(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('shelves', 'readwrite')
      tx.objectStore('shelves').add({
        id,
        name: 'test shelf',
        type: 'filter',
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return id
  })
}

// Helper: seed a second location plus an item stocked in the default one, so
// the item-detail Stock tab renders its all-locations PAGER (chrome only shows
// with more than one location). Returns the item ID.
//
// Note for future readers: axe's colour-contrast rule is text-only, so a green
// run here says nothing about the pager DOTS. Their styling is judged by eye in
// LocationPager.stories.tsx. What these tests do cover is the tablist/tabpanel
// wiring, the accessible names, and the dialog semantics.
const A11Y_PAGER_ITEM = 'a11y-pager-item'
const A11Y_OTHER_LOCATION = 'a11y-other-location'

async function seedStockPagerFixture(
  page: import('@playwright/test').Page,
): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const now = new Date()

  await seedRows(page, 'locations', [
    { id: A11Y_OTHER_LOCATION, name: 'Office', order: 1, createdAt: now, updatedAt: now },
  ])
  await seedRows(page, 'items', [
    {
      id: A11Y_PAGER_ITEM,
      name: 'pager item',
      tagIds: [],
      vendorIds: [],
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(page, 'itemStocks', [
    {
      id: 'a11y-pager-stock',
      itemId: A11Y_PAGER_ITEM,
      locationId: 'local',
      // Global configuration lives on the Item since v16.
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
  return A11Y_PAGER_ITEM
}

// Helper: seed a recipe into IndexedDB and return its ID
async function seedRecipe(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('recipes', 'readwrite')
      tx.objectStore('recipes').add({ id, name: 'test recipe', items: [], createdAt: new Date() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return id
  })
}

// Seeds the two recipe-card states the cooking page's Row 3 stock status can be
// in, so axe scans real cards rather than an empty page:
//
//   Pasta Carbonara  →  "3 / 3 here · 1 empty · 1 low stock"  (healthy card;
//                       exercises text-status-error-foreground and
//                       text-status-warning-foreground)
//   Thai Curry       →  "0 / 2 here"  (nothing stocked here: disabled checkbox
//                       on an opacity-80 dimmed card, so the dim's composited
//                       text is scanned for contrast)
//
// Without this the /cooking scans below pass against a page with no recipes on
// it, which proves nothing about either state.
async function seedCookingFixture(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const now = new Date()

  // A second location, so "stocked elsewhere" refers to somewhere real.
  await seedRows(page, 'locations', [
    { id: A11Y_OTHER_LOCATION, name: 'Office', order: 1, createdAt: now, updatedAt: now },
  ])

  const item = (id: string, name: string) => ({
    id,
    name,
    tagIds: [],
    vendorIds: [],
    createdAt: now,
    updatedAt: now,
  })
  const stock = (
    itemId: string,
    locationId: string,
    targetQuantity: number,
    refillThreshold: number,
    packedQuantity: number,
  ) => ({
    id: `a11y-cooking-stock-${itemId}`,
    itemId,
    locationId,
    // Global configuration lives on the Item since v16.
    targetQuantity,
    refillThreshold,
    packedQuantity,
    unpackedQuantity: 0,
    createdAt: now,
    updatedAt: now,
  })

  await seedRows(page, 'items', [
    item('a11y-cooking-flour', 'flour'),
    item('a11y-cooking-butter', 'butter'),
    item('a11y-cooking-cream', 'cream'),
    item('a11y-cooking-paste', 'curry paste'),
    item('a11y-cooking-coconut', 'coconut milk'),
  ])
  await seedRows(page, 'itemStocks', [
    // Stocked in the active location: healthy, empty, low stock.
    stock('a11y-cooking-flour', 'local', 4, 2, 5),
    stock('a11y-cooking-butter', 'local', 4, 2, 0),
    stock('a11y-cooking-cream', 'local', 4, 2, 2),
    // Stocked ONLY in the other location — unavailable on /cooking.
    stock('a11y-cooking-paste', A11Y_OTHER_LOCATION, 4, 1, 3),
    stock('a11y-cooking-coconut', A11Y_OTHER_LOCATION, 4, 1, 3),
  ])
  await seedRows(page, 'recipes', [
    {
      id: 'a11y-cooking-recipe-ok',
      name: 'pasta carbonara',
      items: [
        { itemId: 'a11y-cooking-flour', defaultAmount: 1 },
        { itemId: 'a11y-cooking-butter', defaultAmount: 1 },
        { itemId: 'a11y-cooking-cream', defaultAmount: 1 },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'a11y-cooking-recipe-unavailable',
      name: 'thai curry',
      items: [
        { itemId: 'a11y-cooking-paste', defaultAmount: 1 },
        { itemId: 'a11y-cooking-coconut', defaultAmount: 1 },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ])
}

test.describe('detail page a11y', () => {
  // Item detail page (/items/:id)
  test('user can view item detail page without accessibility violations', async ({ page, baseURL }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item detail page (use absolute URL to ensure SPA navigation works)
    await page.goto(`${baseURL}/items/${itemId}/`)
    await page.waitForURL(`**/items/${itemId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail stock tab (/items/:id/stock)
  test('user can view item detail stock tab without accessibility violations', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item stock tab
    await page.goto(`/items/${itemId}/stock`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail stock tab, stocked page WITH the all-locations pager
  test('user can view the stock pager on a stocked location without accessibility violations', async ({ page }) => {
    // Given an item stocked in the active location, with a second location so
    // the pager chrome renders
    const itemId = await seedStockPagerFixture(page)
    const stockTab = new StockPagerPage(page)

    // When the user opens the Stock tab
    await stockTab.navigateTo(itemId)
    await stockTab.getStockForm().waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations (see KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION —
    // this fixture's item has no packageUnit configured, so the stock preview's
    // UnitBadge renders the literal "unit" fallback)
    await checkA11yAllowingKnownBadgeContrast(page)
  })

  // Item detail stock tab, NOT-stocked page (empty state + "Add to location")
  test('user can view the stock pager on a not-stocked location without accessibility violations', async ({ page }) => {
    // Given the same fixture, paged to the location the item is not stocked in
    const itemId = await seedStockPagerFixture(page)
    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(itemId)
    await stockTab.goToNext()
    await stockTab.getAddToLocationButton().waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail stock tab, remove-from-location confirmation dialog
  test('user can view the remove-from-location dialog without accessibility violations', async ({ page }) => {
    // Given the stocked page with its remove confirmation open
    const itemId = await seedStockPagerFixture(page)
    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(itemId)
    await stockTab.openRemoveDialog()
    // The affected-counts line renders only once both count queries resolve —
    // scan the dialog in its final state, not mid-load
    await stockTab.getAffectedCounts().waitFor({ state: 'visible' })
    await injectAxe(page)

    // Then there should be no violations (see KNOWN_CONFIRM_CONTRAST_EXCLUSION
    // and KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION — this fixture's item has no
    // packageUnit configured, so the Stock tab's preview behind the dialog
    // renders the literal "unit" fallback)
    await checkA11yAllowingKnownConfirmAndBadgeContrast(page)
  })

  // Item detail relation > tags subtab (/items/:id/relation/tags)
  test('user can view item detail relation tags subtab without accessibility violations', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item relation tags subtab
    await page.goto(`/items/${itemId}/relation/tags`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail relation > vendors subtab (/items/:id/relation/vendors)
  test('user can view item detail relation vendors subtab without accessibility violations', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item relation vendors subtab (direct nav)
    await page.goto(`/items/${itemId}/relation/vendors`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail relation > recipes subtab (/items/:id/relation/recipes)
  test('user can view item detail relation recipes subtab without accessibility violations', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item relation recipes subtab
    await page.goto(`/items/${itemId}/relation/recipes`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Tag detail (/settings/tags/:id)
  test('user can view settings tag detail page without accessibility violations', async ({ page }) => {
    // Given a seeded tag
    const tagId = await seedTag(page)

    // When the user navigates to the tag detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/tags/${tagId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Vendor detail (/settings/vendors/:id)
  test('user can view settings vendor detail page without accessibility violations', async ({ page }) => {
    // Given a seeded vendor
    const vendorId = await seedVendor(page)

    // When the user navigates to the vendor detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/vendors/${vendorId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Recipe detail (/settings/recipes/:id)
  test('user can view settings recipe detail page without accessibility violations', async ({ page }) => {
    // Given a seeded recipe
    const recipeId = await seedRecipe(page)

    // When the user navigates to the recipe detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/recipes/${recipeId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Shelf detail view (/?groupBy=shelf&id=:shelfId)
  test('user can view shelf detail page without accessibility violations', async ({ page }) => {
    // Given a seeded shelf
    const shelfId = await seedShelf(page)

    // When the user navigates to the shelf detail view
    await page.goto(`/?groupBy=shelf&id=${shelfId}`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Shelf detail (/settings/shelves/:id)
  test('user can view settings shelf detail page without accessibility violations', async ({ page }) => {
    // Given a seeded shelf
    const shelfId = await seedShelf(page)

    // When the user navigates to the shelf settings detail page
    await page.goto(`/settings/shelves/${shelfId}/`)
    await page.waitForURL(`**/settings/shelves/${shelfId}/**`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })
})

test.describe('dark mode a11y', () => {
  test.beforeEach(async ({ page }) => {
    // Set dark mode preference before page load so the inline script picks it up
    await page.addInitScript(() => {
      localStorage.setItem('theme-preference', 'dark')
    })
  })

  // Pantry page (/) in dark mode
  test('user can view pantry page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the pantry (home) page with dark mode enabled
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Shopping page (/shopping) in dark mode
  test('user can view shopping page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the shopping page with dark mode enabled
    await page.goto('/shopping')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Shopping > Vendor cart page (/shopping/:vendorId) in dark mode
  test('user can view vendor cart page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded vendor (dark mode enabled)
    const vendorId = await seedVendor(page)

    // Navigate to the vendor's cart page
    await page.goto(`/shopping/${vendorId}`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Cooking page (/cooking) in dark mode
  test('user can view cooking page without accessibility violations in dark mode', async ({ page }) => {
    // Given seeded recipe cards covering both stock-status states
    await seedCookingFixture(page)

    // Navigate to the cooking page with dark mode enabled, waiting until the
    // unavailable card has rendered
    await page.goto('/cooking')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('0 / 2 here')).toBeVisible()

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings main page (/settings) in dark mode
  test('user can view settings page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the settings page with dark mode enabled
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Tags list (/settings/tags) in dark mode
  test('user can view settings tags list without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the tags settings page with dark mode enabled
    await page.goto('/settings/tags')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Vendors list (/settings/vendors) in dark mode
  test('user can view settings vendors list without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the vendors settings page with dark mode enabled
    await page.goto('/settings/vendors')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Recipes list (/settings/recipes) in dark mode
  test('user can view settings recipes list without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the recipes settings page with dark mode enabled
    await page.goto('/settings/recipes')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Shelves group-by view (/?groupBy=shelf) in dark mode
  test('user can view shelves page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the pantry page in shelf group-by mode with dark mode enabled
    await page.goto('/?groupBy=shelf')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Vendor group-by view (/?groupBy=vendor) in dark mode
  test('user can view vendor group-by page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded vendor with an item linked to it (dark mode enabled)
    const vendorId = await seedVendor(page)
    await page.evaluate(async (vId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const id = crypto.randomUUID()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite')
        tx.objectStore('items').add({
          id,
          name: 'vendor item',
          tagIds: [],
          vendorIds: [vId],
          recipeIds: [],
          targetQuantity: 1,
          refillThreshold: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }, vendorId)

    // When the user navigates to the vendor group-by view
    await page.goto('/?groupBy=vendor')
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Recipe group-by view (/?groupBy=recipe) in dark mode
  test('user can view recipe group-by page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded recipe with an item linked to it (dark mode enabled)
    const recipeId = await seedRecipe(page)
    await page.evaluate(async (rId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const itemId = crypto.randomUUID()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['items', 'recipes'], 'readwrite')
        tx.objectStore('items').add({
          id: itemId,
          name: 'recipe item',
          tagIds: [],
          vendorIds: [],
          recipeIds: [rId],
          targetQuantity: 1,
          refillThreshold: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        const recipeStore = tx.objectStore('recipes')
        const getReq = recipeStore.get(rId)
        getReq.onsuccess = () => {
          const recipe = getReq.result
          recipe.items = [{ itemId, defaultAmount: 1, consumeAmount: 1 }]
          recipeStore.put(recipe)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }, recipeId)

    // When the user navigates to the recipe group-by view
    await page.goto('/?groupBy=recipe')
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Shelves list (/settings/shelves) in dark mode
  test('user can view settings shelves list without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the shelves settings page with dark mode enabled
    await page.goto('/settings/shelves')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Locations list (/settings/locations) in dark mode
  test('user can view settings locations list without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the locations settings page with dark mode enabled
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Onboarding page (/onboarding) in dark mode
  test('user can view onboarding page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates directly to the onboarding page with dark mode enabled
    await page.goto('/onboarding')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail page (/items/:id) in dark mode
  test('user can view item detail page without accessibility violations in dark mode', async ({ page, baseURL }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item detail page (use absolute URL to ensure SPA navigation works)
    await page.goto(`${baseURL}/items/${itemId}/`)
    await page.waitForURL(`**/items/${itemId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail stock tab (/items/:id/stock) in dark mode
  test('user can view item detail stock tab without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item stock tab
    await page.goto(`/items/${itemId}/stock`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail stock tab, stocked page WITH the all-locations pager, in dark mode
  test('user can view the stock pager on a stocked location without accessibility violations in dark mode', async ({ page }) => {
    // Given an item stocked in the active location, with a second location so
    // the pager chrome renders (dark mode enabled)
    const itemId = await seedStockPagerFixture(page)
    const stockTab = new StockPagerPage(page)

    // When the user opens the Stock tab
    await stockTab.navigateTo(itemId)
    await stockTab.getStockForm().waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail stock tab, NOT-stocked page, in dark mode
  test('user can view the stock pager on a not-stocked location without accessibility violations in dark mode', async ({ page }) => {
    // Given the same fixture, paged to the location the item is not stocked in
    const itemId = await seedStockPagerFixture(page)
    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(itemId)
    await stockTab.goToNext()
    await stockTab.getAddToLocationButton().waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail stock tab, remove-from-location confirmation dialog, in dark mode
  test('user can view the remove-from-location dialog without accessibility violations in dark mode', async ({ page }) => {
    // Given the stocked page with its remove confirmation open
    const itemId = await seedStockPagerFixture(page)
    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(itemId)
    await stockTab.openRemoveDialog()
    await stockTab.getAffectedCounts().waitFor({ state: 'visible' })
    await injectAxe(page)

    // Then there should be no violations (see KNOWN_CONFIRM_CONTRAST_EXCLUSION)
    await checkA11yAllowingKnownConfirmContrast(page)
  })

  // Item detail relation > tags subtab (/items/:id/relation/tags) in dark mode
  test('user can view item detail relation tags subtab without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item relation tags subtab
    await page.goto(`/items/${itemId}/relation/tags`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail relation > vendors subtab (/items/:id/relation/vendors) in dark mode
  test('user can view item detail relation vendors subtab without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item relation vendors subtab (direct nav)
    await page.goto(`/items/${itemId}/relation/vendors`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Item detail relation > recipes subtab (/items/:id/relation/recipes) in dark mode
  test('user can view item detail relation recipes subtab without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item relation recipes subtab
    await page.goto(`/items/${itemId}/relation/recipes`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Tag detail (/settings/tags/:id) in dark mode
  test('user can view settings tag detail page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded tag
    const tagId = await seedTag(page)

    // When the user navigates to the tag detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/tags/${tagId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Vendor detail (/settings/vendors/:id) in dark mode
  test('user can view settings vendor detail page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded vendor
    const vendorId = await seedVendor(page)

    // When the user navigates to the vendor detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/vendors/${vendorId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Recipe detail (/settings/recipes/:id) in dark mode
  test('user can view settings recipe detail page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded recipe
    const recipeId = await seedRecipe(page)

    // When the user navigates to the recipe detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/recipes/${recipeId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Shelf detail view (/?groupBy=shelf&id=:shelfId) in dark mode
  test('user can view shelf detail page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded shelf with dark mode enabled
    const shelfId = await seedShelf(page)

    // When the user navigates to the shelf detail view
    await page.goto(`/?groupBy=shelf&id=${shelfId}`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Settings > Shelf detail (/settings/shelves/:id) in dark mode
  test('user can view settings shelf detail page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded shelf with dark mode enabled
    const shelfId = await seedShelf(page)

    // When the user navigates to the shelf settings detail page
    await page.goto(`/settings/shelves/${shelfId}/`)
    await page.waitForURL(`**/settings/shelves/${shelfId}/**`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page, undefined, AXE_OPTIONS)
  })
})

test.describe('mobile viewport a11y', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone 14 Pro

  test('user can view pantry page without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the pantry (home) page on a mobile viewport
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  test('user can view shopping page without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the shopping page on a mobile viewport
    await page.goto('/shopping')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  test('user can view cooking page without accessibility violations on mobile', async ({ page }) => {
    // Given seeded recipe cards covering both stock-status states
    await seedCookingFixture(page)

    // Navigate to the cooking page on a mobile viewport, waiting until the
    // unavailable card has rendered
    await page.goto('/cooking')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('0 / 2 here')).toBeVisible()

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  // Shopping > Vendor cart page (/shopping/:vendorId) on mobile
  test('user can view vendor cart page without accessibility violations on mobile', async ({ page }) => {
    // Given a seeded vendor on a mobile viewport
    const vendorId = await seedVendor(page)

    // Navigate to the vendor's cart page, exercising the toolbar (LocationSwitcher,
    // back button, vendor name, cart count, cancel/done) at 390px width
    await page.goto(`/shopping/${vendorId}`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations, including no toolbar-crowding contrast/overlap issues
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  test('user can view settings page without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the settings page on a mobile viewport
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  test('user can view shelves page without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the pantry page in shelf group-by mode on a mobile viewport
    await page.goto('/?groupBy=shelf')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  test('user can view settings shelves list without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the shelves settings page on a mobile viewport
    await page.goto('/settings/shelves')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  test('user can view shelf detail page without accessibility violations on mobile', async ({ page }) => {
    // Given a seeded shelf on a mobile viewport
    const shelfId = await seedShelf(page)

    // When the user navigates to the shelf detail view
    await page.goto(`/?groupBy=shelf&id=${shelfId}`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page, undefined, AXE_OPTIONS)
  })

  test('user can view settings shelf detail page without accessibility violations on mobile', async ({ page }) => {
    // Given a seeded shelf on a mobile viewport
    const shelfId = await seedShelf(page)

    // When the user navigates to the shelf settings detail page
    await page.goto(`/settings/shelves/${shelfId}/`)
    await page.waitForURL(`**/settings/shelves/${shelfId}/**`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page, undefined, AXE_OPTIONS)
  })
})
