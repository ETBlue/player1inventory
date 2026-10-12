import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import type { Fixture } from '../helpers/fixture'
import { seedLocalFixture } from '../helpers/localSeed'
import { readRows } from '../helpers/locationSeed'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'
import { makeGql } from '../utils/cloud'

// Unified item search — PR A: the cart page's two-section search tail. PR B
// (this file's pantry/shelf-detail blocks below): the same tail wired onto
// the flat pantry (bucket 3 only) and shelf detail (selection + filter
// shelves), via the shared `useItemSearchTailWiring` hook.
//
// THE FIXTURE IS THE TEST. Milk is stocked ONLY at the Office. Against a
// location-blind implementation it reads as stocked here, lands in the cart's
// own list, and every assertion below stops distinguishing right from wrong.
//
// RUNS IN BOTH PROJECTS as of issue #323 task 3. The fixture is described
// ONCE as plain data (helpers/fixture.ts) and translated per mode —
// `seedLocalFixture` writes IndexedDB, `seedCloudFixture` writes Postgres
// through GraphQL.
//
// The header comment here used to say this flow was local-only because every
// fixture seeded IndexedDB through `page.evaluate()`, which writes nothing a
// cloud-mode app reads. That reason was true. The sentence that followed it was
// not: it called the file's `test.skip` guards "belt-and-braces", and this file
// has never had a single `test.skip` call. The `cloud` project's `testMatch`
// was the only thing excluding it.
//
// WHAT THE CLOUD RUN ADDS: the first real-SQL coverage of
// `applyShelfFilterPicks` (apps/server/src/resolvers/shelf.resolver.ts line
// 85) — tests 7 and 8 below are the only tests anywhere that reach it. It is a
// `prisma.$transaction` doing `deleteMany` plus `createMany` on the
// composite-key `ItemTag` and `ItemVendor` join tables, a `recipeItem.create`
// and a `findUniqueOrThrow`, and its own comment describes a Postgres
// `READ COMMITTED` deadlock it skips the delete+recreate to avoid. Before this
// spec joined `cloud`, `grep -rn applyShelfFilterPicks e2e/` returned nothing.
// Every server test for it runs against the hand-written Prisma fake in
// `apps/server/src/test/`, and that fake models only the interactive-callback
// form of `$transaction` (root `CLAUDE.md`), so real SQL is the only way to
// exercise what this resolver is written to survive.
//
// It also brings `updateShelf(itemIds:)` (test 6) and a second route to
// `shelf(id:)`, which `settings/shelves.spec.ts` reached first.
//
// EVERY MUTATION HERE IS CHECKED BY READING THE BACKEND, NOT THE SCREEN.
// `readShelf`, `readItem` and `readRecipe` below exist because the screen
// assertions cannot fail on their own:
//   * `toHaveCount(0)` on a divider is satisfied by a list that has not
//     finished refetching — the same failure task 1 of this issue measured on
//     `not.toBeVisible()` (e2e/tests/settings/shelves.spec.ts).
//   * `getItemCard(name)` is visible whether the item sits in the group's own
//     list or in the search tail — `ItemSearchTail` renders the same
//     `ItemCard`. So "the card is still there" is true before and after every
//     press on this page.
// The screen assertions are kept, because they are what the user sees, but the
// readback is the guard.
//
// EVERY "AFTER" READBACK USES `expect.poll`, AND IT HAS TO. `expect(locator)`
// auto-retries; `expect(plainValue)` does NOT. A `.click()` resolves when the
// click is dispatched, not when the mutation it starts has committed, so a bare
// `expect(await readShelf(...))` right after a press reads the backend before
// the write lands and fails on a correct implementation. Measured 2026-10-12 in
// `cloud` with the resolver UNMODIFIED: test 6's readback failed with
// `Expected value: "item-milk" / Received array: []`. `expect.poll` retries the
// read until it agrees or the timeout expires, so it still reports a VALUE
// DIFFERENCE under a broken write and no longer races a working one.
//
// The "before" readbacks — the ones asserting an id is NOT there yet — are
// plain `expect` on purpose, and they are NEGATIVE CONTROLS, not evidence. They
// cannot fail early: the state they assert holds from the seed onward.

// ─── Ids. Fixed strings in both modes ────────────────────────────────────────
//
// `HOME = 'local'` and `OFFICE = 'office-loc'` used to live here and both had
// to go: in cloud the default location id is a server-generated cuid and a
// non-default location's id comes back from `createLocation`. Locations are
// named by the fixture's symbolic `key` instead, and every assertion that
// mentions one uses its NAME ("Add to My Home"), which is the same in both
// modes.
//
// Entity ids DO survive into cloud — `ItemInput`, `VendorInput`, `TagTypeInput`,
// `TagInput`, `ShelfInput` and `RecipeInput` all declare `id: ID!` — so the
// specs below keep navigating by literal id.
const COSTCO = 'vendor-costco'
const MILK = 'item-milk'
const BREAD = 'item-bread'
const MILK_POWDER = 'item-milk-powder'

// Shared per-location quantities: 1 of a target 2, above a refill threshold
// of 1. Not empty and not low, so no health badge text competes with a
// "N not stocked here" assertion.
const STOCK = {
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
} as const

// Two locations, one vendor, two items. Milk carries Costco and is stocked
// ONLY at the Office; Bread is stocked at My Home and carries no vendor.
//
// The default location is listed FIRST on purpose. `seedLocalFixture` writes
// `order: index` for every location including the default, while
// `seedCloudFixture` never creates the default and discards its array
// position — so moving it changes the local page order and is invisible in
// cloud (measured 2026-09-24).
const BASE: Fixture = {
  locations: [
    { key: 'HOME', name: 'My Home', isDefault: true },
    { key: 'OFFICE', name: 'Office' },
  ],
  vendors: [{ id: COSTCO, name: 'Costco' }],
  items: [
    { id: MILK, name: 'Milk', vendorIds: [COSTCO] },
    { id: BREAD, name: 'Bread' },
  ],
  stocks: [
    { itemId: MILK, location: 'OFFICE', ...STOCK },
    { itemId: BREAD, location: 'HOME', ...STOCK },
  ],
  shelves: [],
  recipes: [],
}

// The PR C probe: exists globally, stocked ONLY at the Office, carrying no
// vendor and belonging to no recipe.
//
// WHY A SECOND PROBE RATHER THAN REUSING MILK: Milk already carries Costco, so
// stocking it here would drop it straight into the Costco page's own list in
// ONE press — the correct behaviour (there is no membership left to grant), but
// the wrong fixture for a two-step gate. A probe must be BOTH not-stocked-here
// AND outside the group for the second press to exist at all.
//
// The name also isolates it from Milk: the tail matches on
// `name.includes(query)`, and "milk" does not include "milk powder", so
// `q: 'milk powder'` selects this row alone.
const WITH_MILK_POWDER: Fixture = {
  ...BASE,
  items: [...BASE.items, { id: MILK_POWDER, name: 'Milk Powder' }],
  stocks: [...BASE.stocks, { itemId: MILK_POWDER, location: 'OFFICE', ...STOCK }],
}

/**
 * Seed `fixture` into whichever backend this project runs against.
 *
 * ONE CALL PER TEST, NEVER TWO. The old local-only version seeded a base in
 * `beforeEach` and appended more rows inside each test body — 15 `seedRows`
 * sites in all. That shape cannot be translated: `seedCloudFixture` creates
 * every non-default location it is given, so a second call would create a
 * second "Office", and its stock step reconciles against what the database
 * holds for the items IT was handed. So each test passes one complete fixture,
 * derived from `BASE` by spreading.
 */
async function seedFixture(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  fixture: Fixture,
): Promise<void> {
  if (baseURL === CLOUD_WEB_URL) {
    await seedCloudFixture(request, fixture)
    return
  }
  // `seedLocalFixture` navigates to `/` first so Dexie creates the schema, and
  // resolves each write on the transaction's `oncomplete`. It writes real
  // `Date` objects, which matters here: `addItemToLocation` calls `.getTime()`
  // on a stock row's `updatedAt` when picking a source row to copy from, and a
  // string there throws mid-click — exactly what the "Add to My Home" presses
  // below exercise.
  await seedLocalFixture(page, fixture)
}

// ─── Mode-aware readbacks ────────────────────────────────────────────────────
//
// A cloud run has no IndexedDB, so `readRows(page, …)` returns `[]` there and
// any assertion built on it passes against every implementation. Each helper
// below reads the local store in `local` and runs the matching GraphQL query in
// `cloud`. The Dexie row and the GraphQL type use the same key names, so one
// return type covers both modes.

type ShelfRow = {
  id: string
  name: string
  itemIds?: string[] | null
  filterConfig?: { tagIds?: string[] | null } | null
}
type ItemRow = { id: string; name: string; tagIds: string[]; vendorIds?: string[] | null }
type RecipeRow = { id: string; name: string; items: { itemId: string }[] }

const SHELF_QUERY = `query ($id: ID!) {
  shelf(id: $id) { id name itemIds filterConfig { tagIds } }
}`
const ITEM_QUERY = `query ($id: ID!) { item(id: $id) { id name tagIds vendorIds } }`
const RECIPE_QUERY = `query ($id: ID!) { recipe(id: $id) { id name items { itemId } } }`

/** One shelf row, or undefined. Cloud goes through `shelf(id:)`. */
async function readShelf(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  id: string,
): Promise<ShelfRow | undefined> {
  if (baseURL === CLOUD_WEB_URL) {
    const gql = makeGql(request)
    const { shelf } = await gql<{ shelf: ShelfRow | null }>(SHELF_QUERY, { id })
    return shelf ?? undefined
  }
  const rows = (await readRows(page, 'shelves')) as unknown as ShelfRow[]
  return rows.find((row) => row.id === id)
}

/** One item row, or undefined. Cloud goes through `item(id:)`. */
async function readItem(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  id: string,
): Promise<ItemRow | undefined> {
  if (baseURL === CLOUD_WEB_URL) {
    const gql = makeGql(request)
    const { item } = await gql<{ item: ItemRow | null }>(ITEM_QUERY, { id })
    return item ?? undefined
  }
  const rows = (await readRows(page, 'items')) as unknown as ItemRow[]
  return rows.find((row) => row.id === id)
}

/** One recipe row, or undefined. Cloud goes through `recipe(id:)`. */
async function readRecipe(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  id: string,
): Promise<RecipeRow | undefined> {
  if (baseURL === CLOUD_WEB_URL) {
    const gql = makeGql(request)
    const { recipe } = await gql<{ recipe: RecipeRow | null }>(RECIPE_QUERY, {
      id,
    })
    return recipe ?? undefined
  }
  const rows = (await readRows(page, 'recipes')) as unknown as RecipeRow[]
  return rows.find((row) => row.id === id)
}

test.beforeEach(async ({ page, request, baseURL }) => {
  // Prevent the empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  if (baseURL === CLOUD_WEB_URL) {
    // Guards against a previous run that crashed before its teardown.
    await cleanupCloudData(request)
  }
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete this user's rows through the E2E cleanup endpoint.
    await cleanupCloudData(request)
    return
  }
  // Local mode: clear IndexedDB, localStorage, and sessionStorage.
  await page.goto('/')
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('Player1Inventory')
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can find and stock an item that lives at another location', async ({
  page,
  request,
  baseURL,
}) => {
  const shopping = new ShoppingPage(page)

  // Given Milk carries Costco but is stocked only at the Office
  await seedFixture(page, request, baseURL, BASE)

  // When the user searches for it in the Costco cart at My Home
  await shopping.searchInCart(COSTCO, 'milk')

  // Then it is offered under "not stocked here" instead of looking absent,
  // and Create is suppressed — it already exists globally (#245)
  await expect(shopping.getNotStockedHereDivider()).toBeVisible()
  await expect(shopping.getItemCard('Milk')).toBeVisible()
  await expect(shopping.getCreateItemButton()).toHaveCount(0)

  // When the user stocks it here
  await shopping.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it lands in the cart's own list in one press — it already carried
  // the vendor, so there is no group step left to take
  await expect(shopping.getItemCheckbox('Milk')).toBeVisible()
  await expect(shopping.getNotStockedHereDivider()).toHaveCount(0)
})

test('user must press twice to stock an item here and add it to this cart', async ({
  page,
  request,
  baseURL,
}) => {
  const shopping = new ShoppingPage(page)

  // Given Bread is stocked at My Home but carries no vendor
  await seedFixture(page, request, baseURL, BASE)

  // When the user searches for it in the Costco cart
  await shopping.searchInCart(COSTCO, 'bread')

  // Then it sits under "not in this list" with a vendor action, not in the cart
  await expect(shopping.getNotInThisListDivider()).toBeVisible()
  await expect(shopping.getItemCheckbox('Bread')).toHaveCount(0)

  // When the user applies the vendor
  await shopping.getTailActionButton('Apply Costco', 'Bread').click()

  // Then it joins the cart's pending list
  await expect(shopping.getItemCheckbox('Bread')).toBeVisible()
  await expect(shopping.getNotInThisListDivider()).toHaveCount(0)

  // And the vendor really landed on the item row, not only on the screen
  await expect
    .poll(
      async () =>
        (await readItem(page, request, baseURL, BREAD))?.vendorIds ?? [],
    )
    .toContain(COSTCO)
})

test('user can create an item when nothing in the catalog matches', async ({
  page,
  request,
  baseURL,
}) => {
  const shopping = new ShoppingPage(page)

  // Given no item is named Zucchini
  await seedFixture(page, request, baseURL, BASE)

  // When the user searches for it
  await shopping.searchInCart(COSTCO, 'Zucchini')

  // Then Create is offered — suppressing it here would be a dead end
  await expect(shopping.getCreateItemButton()).toBeVisible()
})

test('user stocking a vendored item from the no-vendor cart sees it filed under its vendor', async ({
  page,
  request,
  baseURL,
}) => {
  const shopping = new ShoppingPage(page)

  // Given Milk carries Costco and is stocked only at the Office
  await seedFixture(page, request, baseURL, BASE)

  // When the user searches for it on the no-vendor cart
  //
  // `'no-vendor'` IS A ROUTE PARAM SENTINEL, NOT A CART ID, and that is why
  // this URL is correct in both modes. `$vendorId.tsx` line 63 reads
  // `vendorIdParam === 'no-vendor' ? null : vendorIdParam` and hands that
  // `null` to `useVendorCart`, which in cloud runs
  // `vendorCart(vendorId: null, locationId:)` — the resolver creates the row
  // when it is missing and keys it `${locationId}:no-vendor`. So no spec ever
  // sends the bare string `'no-vendor'` as an id. The cart row of issue #327,
  // whose bare id collided across users, came from an IMPORT payload, not from
  // this route; `cart-id-cross-user-leak.spec.ts` is the negative control for
  // that one.
  await shopping.searchInCart('no-vendor', 'milk')

  // Then it is offered under "not stocked here"
  await expect(shopping.getNotStockedHereDivider()).toBeVisible()

  // When the user stocks it here
  await shopping.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it moves into the middle section, which explains where it went
  // rather than offering an action — joining THIS group would mean stripping
  // Costco off the item
  await expect(shopping.getNotInThisListDivider()).toBeVisible()
  await expect(page.getByText('In Costco')).toBeVisible()
  await expect(shopping.getNotStockedHereDivider()).toHaveCount(0)
  // The label must be the REAL one a vendor cart would render — asserting a
  // count of 0 against a name no button ever carries proves nothing.
  await expect(
    shopping.getTailActionButton('Apply Costco', 'Milk'),
  ).toHaveCount(0)
})

// Unified item search, PR B — the same tail wired onto the flat pantry
// (bucket 3 only) and shelf detail (selection + filter shelves).

test('user can find and stock an item that lives at another location from the flat pantry', async ({
  page,
  request,
  baseURL,
}) => {
  const pantry = new PantryPage(page)

  // Given Milk is stocked only at the Office
  await seedFixture(page, request, baseURL, BASE)

  // When the user searches for it on the flat pantry
  await pantry.gotoWithSearch({ q: 'milk' })

  // Then it is offered under "not stocked here" — the flat pantry has no
  // bucket 2 (inGroupIds is every stocked-here item), so this is the only
  // tail section it ever shows
  await expect(pantry.getNotStockedHereDivider()).toBeVisible()
  await expect(pantry.getItemCard('Milk')).toBeVisible()

  // When the user stocks it here
  await pantry.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it lands directly in the main list — bucket 1 IS bucket 2 on the
  // flat pantry, so there is no separate "not in this list" step
  await expect(pantry.getNotStockedHereDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Milk')).toBeVisible()
})

test('user must press twice to stock an item at a location and add it to a selection shelf', async ({
  page,
  request,
  baseURL,
}) => {
  const pantry = new PantryPage(page)
  const fridgeShelfId = 'shelf-fridge'

  // Given a selection shelf with no members yet, and Milk stocked only at
  // the Office
  await seedFixture(page, request, baseURL, {
    ...BASE,
    shelves: [
      {
        id: fridgeShelfId,
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [],
      },
    ],
  })

  // When the user searches for Milk inside the Fridge shelf
  await pantry.gotoWithSearch({
    groupBy: 'shelf',
    id: fridgeShelfId,
    q: 'milk',
  })

  // Then it sits under "not stocked here", not the shelf's own list
  await expect(pantry.getNotStockedHereDivider()).toBeVisible()

  // When the user stocks it at My Home
  await pantry.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it moves to "not in this list" — a single press did NOT also join
  // the shelf
  await expect(pantry.getNotInThisListDivider()).toBeVisible()
  await expect(pantry.getNotStockedHereDivider()).toHaveCount(0)

  // And the shelf row is still empty, which is the half of "did NOT also
  // join" that the screen cannot show: a tail row and a member row render the
  // same `ItemCard`.
  //
  // A NEGATIVE CONTROL. It holds from the seed onward, so it passes against an
  // `updateShelf` that writes nothing at all. Kept because it names what the
  // two-press gate means; not counted as coverage.
  const beforeSecondPress = await readShelf(page, request, baseURL, fridgeShelfId)
  expect(beforeSecondPress?.itemIds ?? []).not.toContain(MILK)

  // When the user presses "Add to shelf" — the second, separate press
  await pantry.getTailActionButton('Add to shelf', 'Milk').click()

  // Then the item id really lands in the shelf's own `itemIds`. THIS is the
  // guard on `updateShelf(itemIds:)`, and it runs BEFORE the two screen
  // assertions so a broken write is reported as the missing item id.
  //
  // Measured 2026-10-12 in `cloud` with `updateShelf`'s
  // `if (itemIds != null) data.itemIds = itemIds` line removed: this assertion
  // fails with `Expected value: "item-milk" / Received array: []`.
  await expect
    .poll(
      async () =>
        (await readShelf(page, request, baseURL, fridgeShelfId))?.itemIds ?? [],
    )
    .toContain(MILK)

  // And the tail clears on screen
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Milk')).toBeVisible()
})

test('user can join a filter shelf by confirming its one pre-selected axis in the dialog', async ({
  page,
  request,
  baseURL,
}) => {
  const pantry = new PantryPage(page)
  const snackTagTypeId = 'tagtype-category'
  const snackTagId = 'tag-snacks'
  const snackShelfId = 'shelf-snacks'

  // Given a filter shelf that only matches a Snacks tag, and Bread (stocked
  // at My Home, carrying no tags) does not match it yet — the tag axis offers
  // exactly one option, so `defaultPicksFor` covers the whole set and the
  // dialog pre-selects it, but it still ALWAYS opens (designer ruling,
  // 2026-08-28: the dialog is a double-confirm step, not only a
  // disambiguation step)
  await seedFixture(page, request, baseURL, {
    ...BASE,
    tagTypes: [{ id: snackTagTypeId, name: 'Category', color: 'blue' }],
    tags: [{ id: snackTagId, name: 'Snacks', typeId: snackTagTypeId }],
    shelves: [
      {
        id: snackShelfId,
        name: 'Snack Shelf',
        type: 'filter',
        order: 0,
        itemIds: [],
        filterConfig: { tagIds: [snackTagId] },
      },
    ],
  })

  // The fixture's `filterConfig` really reached the backend. THIS IS A
  // PRECONDITION, not a behaviour assertion, and it is the only guard on the
  // `shelves[].filterConfig` field this task added to `Fixture`. Without it a
  // seed that silently dropped the axes fails further down as a locator
  // timeout on a button that never renders — `canJoinFilterShelf` is false for
  // a filter shelf with no axes, so `ShelfDetailView` gives the tail an inert
  // `groupNote` instead of the `groupAction` this test presses.
  //
  // BOTH HALVES of the threading were measured on 2026-10-12, and both fail
  // here with `Expected value: "tag-snacks" / Received array: []`:
  //   * `cloud` — `seedCloudFixture` sending `filterConfig: null` instead of
  //     the fixture's value;
  //   * `local` — `seedLocalFixture` omitting the key altogether.
  // Before this assertion existed, the cloud mutation failed much later with
  // `locator.click: Test timeout of 30000ms exceeded` — a missing element,
  // which says far less than a missing id.
  const seeded = await readShelf(page, request, baseURL, snackShelfId)
  expect(seeded?.filterConfig?.tagIds ?? []).toContain(snackTagId)

  // When the user searches for Bread inside the Snack Shelf
  await pantry.gotoWithSearch({
    groupBy: 'shelf',
    id: snackShelfId,
    q: 'bread',
  })

  // Then Bread is offered under "not in this list" with a real action button
  await expect(pantry.getNotInThisListDivider()).toBeVisible()

  // When the user presses it
  await pantry.getTailActionButton('Add to shelf', 'Bread').click()

  // Then the dialog opens with the single tag option ALREADY selected — no
  // user choice was needed, but the confirmation step still happens
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Snacks' })).toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Add' })).toBeEnabled()

  // When the user confirms
  await dialog.getByRole('button', { name: 'Add' }).click()

  // Then the dialog closes
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // And the tag really landed on the item row. THIS runs before the two screen
  // assertions on purpose, so a broken write is reported as the missing tag id
  // rather than as a divider that is still on screen.
  //
  // In cloud this is the readback on `applyShelfFilterPicks` — one
  // `prisma.$transaction` that deletes every `ItemTag` row for this item and
  // recreates the union. Measured 2026-10-12 with its `itemTag.createMany`
  // commented out: this assertion fails with
  // `Expected value: "tag-snacks" / Received array: []`.
  await expect
    .poll(
      async () => (await readItem(page, request, baseURL, BREAD))?.tagIds ?? [],
    )
    .toContain(snackTagId)

  // And Bread joins the shelf's own list on screen
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Bread')).toBeVisible()
})

test('user picks per axis in the dialog when a filter shelf spans two tag types requiring genuine choices', async ({
  page,
  request,
  baseURL,
}) => {
  const pantry = new PantryPage(page)
  const categoryTagTypeId = 'tagtype-category'
  const storageTagTypeId = 'tagtype-storage'
  const snackTagId = 'tag-snacks'
  const drinksTagId = 'tag-drinks'
  const fridgeTagId = 'tag-fridge'
  const freezerTagId = 'tag-freezer'
  const treatsShelfId = 'shelf-treats'

  // Given a filter shelf spanning TWO tag types, each offering two options,
  // and Bread (stocked at My Home, carrying no tags) matches neither axis —
  // both axes are unmet, so a press must satisfy BOTH (AND-joined) and the
  // dialog must open for the user to choose each rather than applying
  // anything automatically
  await seedFixture(page, request, baseURL, {
    ...BASE,
    tagTypes: [
      { id: categoryTagTypeId, name: 'Category', color: 'blue' },
      { id: storageTagTypeId, name: 'Storage', color: 'green' },
    ],
    tags: [
      { id: snackTagId, name: 'Snacks', typeId: categoryTagTypeId },
      { id: drinksTagId, name: 'Drinks', typeId: categoryTagTypeId },
      { id: fridgeTagId, name: 'Fridge', typeId: storageTagTypeId },
      { id: freezerTagId, name: 'Freezer', typeId: storageTagTypeId },
    ],
    shelves: [
      {
        id: treatsShelfId,
        name: 'Treats Shelf',
        type: 'filter',
        order: 0,
        itemIds: [],
        filterConfig: {
          tagIds: [snackTagId, drinksTagId, fridgeTagId, freezerTagId],
        },
      },
    ],
  })

  // All four axis tags really reached the backend — the same precondition as
  // the previous test, over a four-id `filterConfig`.
  const seeded = await readShelf(page, request, baseURL, treatsShelfId)
  expect(seeded?.filterConfig?.tagIds ?? []).toEqual(
    expect.arrayContaining([snackTagId, drinksTagId, fridgeTagId, freezerTagId]),
  )

  // When the user searches for Bread inside the Treats Shelf
  await pantry.gotoWithSearch({
    groupBy: 'shelf',
    id: treatsShelfId,
    q: 'bread',
  })

  // Then Bread is offered under "not in this list" with a real action button
  await expect(pantry.getNotInThisListDivider()).toBeVisible()

  // When the user presses it
  await pantry.getTailActionButton('Add to shelf', 'Bread').click()

  // Then the picker dialog opens, titled for this item and shelf, with
  // neither axis pre-selected — a 2-option axis gets no default
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Add Bread to Treats Shelf' }),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()

  // When the user picks only the Category axis's option
  await dialog.getByRole('radio', { name: 'Snacks' }).click()

  // Then Confirm stays disabled — the Storage axis is still AND-joined and
  // unmet, so one axis being satisfied is not enough
  await expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()

  // When the user also picks the Storage axis's option and confirms
  await dialog.getByRole('radio', { name: 'Fridge' }).click()
  await dialog.getByRole('button', { name: 'Add' }).click()

  // Then the dialog closes
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // And BOTH picked tags really landed on the item row, in one call. This is
  // the strongest readback in the file: `applyShelfFilterPicks` reads the
  // item's current tags, unions the two picks onto them, deletes every
  // `ItemTag` row for the item and recreates the whole set inside one
  // transaction. A partial write shows up here as one tag present and one
  // missing — which `arrayContaining` reports as a whole-array difference
  // naming both ids, rather than as two assertions where only the first
  // failure is ever seen.
  await expect
    .poll(
      async () => (await readItem(page, request, baseURL, BREAD))?.tagIds ?? [],
    )
    .toEqual(expect.arrayContaining([snackTagId, fridgeTagId]))

  // And Bread joins the shelf's own list on screen
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Bread')).toBeVisible()
})

// Unified item search, PR C — the same tail wired onto vendor detail and
// recipe detail, the last two of the five surfaces. Both probe with
// `WITH_MILK_POWDER` rather than the base fixture's Milk; see that constant for
// why.

test('user must press twice to stock an item at a location and apply this vendor', async ({
  page,
  request,
  baseURL,
}) => {
  const pantry = new PantryPage(page)

  // Given Milk Powder exists globally, stocked only at the Office, carrying
  // no vendor
  await seedFixture(page, request, baseURL, WITH_MILK_POWDER)

  // When the user searches for it on the Costco vendor page
  await pantry.gotoWithSearch({
    groupBy: 'vendor',
    id: COSTCO,
    q: 'milk powder',
  })

  // Then the page really is Costco's — a wrong id would resolve no vendor and
  // silently suppress the group action below
  await expect(pantry.getDetailHeading('Costco')).toBeVisible()

  // And the item sits under "not stocked here", with no vendor action yet
  await expect(pantry.getNotStockedHereDivider()).toBeVisible()
  await expect(
    pantry.getTailActionButton('Apply Costco', 'Milk Powder'),
  ).toHaveCount(0)

  // When the user stocks it at My Home
  await pantry.getTailActionButton('Add to My Home', 'Milk Powder').click()

  // Then it moves to "not in this list" — a single press did NOT also apply
  // the vendor, or it would have landed in Costco's own list
  await expect(pantry.getNotInThisListDivider()).toBeVisible()
  await expect(pantry.getNotStockedHereDivider()).toHaveCount(0)

  // And the item row still carries no vendor, which is the half the screen
  // cannot show. A negative control, like the one in the selection-shelf test:
  // it holds from the seed onward.
  const beforeSecondPress = await readItem(page, request, baseURL, MILK_POWDER)
  expect(beforeSecondPress?.vendorIds ?? []).not.toContain(COSTCO)

  // When the user applies the vendor — the second, separate press
  await pantry.getTailActionButton('Apply Costco', 'Milk Powder').click()

  // Then it joins Costco's own list and the tail clears entirely
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Milk Powder')).toBeVisible()

  // And the vendor really landed on the item row
  await expect
    .poll(
      async () =>
        (await readItem(page, request, baseURL, MILK_POWDER))?.vendorIds ?? [],
    )
    .toContain(COSTCO)
})

test('user must press twice to stock an item at a location and add it to a recipe', async ({
  page,
  request,
  baseURL,
}) => {
  const pantry = new PantryPage(page)
  const milkshakeId = 'recipe-milkshake'

  // Given Milk Powder exists globally, stocked only at the Office, and an
  // empty recipe
  await seedFixture(page, request, baseURL, {
    ...WITH_MILK_POWDER,
    recipes: [{ id: milkshakeId, name: 'Milkshake', items: [] }],
  })

  // When the user searches for it inside the Milkshake recipe
  await pantry.gotoWithSearch({
    groupBy: 'recipe',
    id: milkshakeId,
    q: 'milk powder',
  })

  // Then the page really is Milkshake's — a wrong id would resolve no recipe
  // and silently suppress the group action below
  await expect(pantry.getDetailHeading('Milkshake')).toBeVisible()

  // And the item sits under "not stocked here", with no recipe action yet
  await expect(pantry.getNotStockedHereDivider()).toBeVisible()
  await expect(
    pantry.getTailActionButton('Add to recipe', 'Milk Powder'),
  ).toHaveCount(0)

  // When the user stocks it at My Home
  await pantry.getTailActionButton('Add to My Home', 'Milk Powder').click()

  // Then it moves to "not in this list" — a single press did NOT also make it
  // an ingredient
  await expect(pantry.getNotInThisListDivider()).toBeVisible()
  await expect(pantry.getNotStockedHereDivider()).toHaveCount(0)

  // And the recipe is still empty, which is the half the screen cannot show.
  // A negative control; it holds from the seed onward.
  const beforeSecondPress = await readRecipe(page, request, baseURL, milkshakeId)
  expect(beforeSecondPress?.items.map((i) => i.itemId) ?? []).not.toContain(
    MILK_POWDER,
  )

  // When the user adds it to the recipe — the second, separate press
  await pantry.getTailActionButton('Add to recipe', 'Milk Powder').click()

  // Then it joins the recipe's own list and the tail clears entirely
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Milk Powder')).toBeVisible()

  // And the item really became an ingredient
  await expect
    .poll(
      async () =>
        (await readRecipe(page, request, baseURL, milkshakeId))?.items.map(
          (recipeItem) => recipeItem.itemId,
        ) ?? [],
    )
    .toContain(MILK_POWDER)
})
