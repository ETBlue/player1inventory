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
import { readStockAt } from '../helpers/stockReadback'
import { StockFormPage } from '../pages/StockFormPage'

// The number inputs on the item-detail Stock tab (`/items/$id/stock`).
//
// Regression guard for the "first keystroke is swallowed" bug (commit 2fe372a1):
// the fields were controlled by a NUMBER with `onChange={e => setX(Number(e.target.value))}`.
// `Number('') === 0` and Packed/Unpacked/Target/Refill all routinely sit AT 0, so
// backspacing the last digit of a field showing `0` produced no state change at
// all — React force-wrote `"0"` back into the DOM node and dropped the caret at
// the end, which reads as "the field lost focus and ate my keystroke".
//
// THIS FILE IS THE ONLY PLACE THAT BEHAVIOUR IS PINNED. jsdom cannot reproduce
// it: `userEvent` keeps its own value buffer independent of React's controlled
// write-back, so the equivalent unit test stays green against the buggy code
// (see apps/web/src/routes/items/CLAUDE.md, "Manual Quantity Input"). Only a
// real browser re-renders the input the way the user saw. Do not delete this
// file on the grounds that ItemForm.test.tsx "already covers it".
//
// RUNS IN BOTH PROJECTS as of cloud-locations issue #284 task 5. It used to
// seed IndexedDB by hand through `seedRows`, which writes nothing a cloud-mode
// app reads, and the three tests carried a `test.skip` on
// `baseURL === CLOUD_WEB_URL`. The fixture is now described ONCE as plain data
// (helpers/fixture.ts) and translated per mode — `seedLocalFixture` writes
// IndexedDB, `seedCloudFixture` writes Postgres through GraphQL.
//
// WHAT THE CLOUD RUN ADDS: the same three keystroke assertions against a real
// per-location `ItemStock` row in Postgres, plus the save round trip through
// `upsertItemStock`. The two readbacks go through `readStockAt`
// (helpers/stockReadback.ts), which reads IndexedDB in local and the
// `itemStocksForItem` query in cloud — a cloud run has no IndexedDB to read.
// `item-stock-pager.spec.ts` shares that helper.
//
// WHAT THIS SPEC CANNOT CATCH: it seeds ONE location, so no location-scoping
// mutation can make it go red. `location-not-stocked-here.spec.ts` and
// `location-scoped-writes.spec.ts` cover that.

const HOME = 'HOME'
const ITEM = 'item-milk'

// One location, one item, one stock row — every quantity at 0, which is what a
// plain `createItem` leaves behind and exactly the state the bug needed.
//
// `consumeAmount: 1` is the product default. `createItem` writes
// `consumeAmount ?? 1` (apps/web/src/db/operations.ts), Prisma declares
// `@default(1)`, and the Dexie v17 upgrade backfills every 0 to 1. An item
// created by the app therefore never holds 0.
//
// This fixture used to seed 0. That was wrong: `ItemForm`
// (apps/web/src/components/item/ItemForm/ItemForm.tsx line 342) computes
// `consumeAmount <= 0 ? t('validation.positiveNumber') : undefined`, so a 0
// opened the form with a validation error on the Info tab — a state the app
// itself cannot produce for a new item. For about 24 hours (2026-08-23 to
// 2026-08-24) both create paths did default to 0; the designer reversed that
// on 2026-08-24, because a new item must be valid by nature.
//
// THE DECIMAL TEST BELOW NOW DEPENDS ON THIS VALUE — through the blur, not
// through `step`. Keep the two apart:
//
//   `step`              — `consumeAmount` feeds `quantityStep`
//                         (ItemForm.tsx line 355), which becomes the Unpacked
//                         input's `step` attribute (line 802). It affects
//                         validity and the spinner, NOT the text the browser
//                         keeps while the field has focus. No test here rides
//                         on it.
//   `normalizeOnBlur`   — `roundToStep(n, consumeAmount)` (ItemForm.tsx lines
//                         277-280 and 806-809). It runs only when the field is
//                         left. `roundToStep` rounds to the step's DECIMAL
//                         PLACES (quantityUtils.ts line 14), so a step of 1
//                         settles 2.5 to 3, and a step of 0 leaves it at 2.5.
//
// Until issue #318 the decimal test never blurred, so it was green at 0 and at
// 1 and caught neither of the two source mutations run on 2026-09-24. It blurs
// now, and 1 is the only fixture value its blur assertion is written for.
//
// Both fields are written out rather than left to the helpers' defaults, so a
// reader can see what this spec runs against. Omitting them gives the same
// values in both modes — 'package' and 1 — since `seedLocalFixture` and
// `seedCloudFixture` default the same way.
const FIXTURE: Fixture = {
  locations: [{ key: HOME, name: 'My Home', isDefault: true }],
  vendors: [],
  items: [
    { id: ITEM, name: 'Milk', targetUnit: 'package', consumeAmount: 1 },
  ],
  stocks: [
    {
      itemId: ITEM,
      location: HOME,
      // Every quantity at zero: the field the user backspaces shows "0".
      packedQuantity: 0,
      unpackedQuantity: 0,
      targetQuantity: 0,
      refillThreshold: 0,
    },
  ],
  shelves: [],
  recipes: [],
}

/** Seed the fixture into whichever backend this project runs against. */
async function seedFixture(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  fixture: Fixture,
): Promise<Record<string, string>> {
  if (baseURL === CLOUD_WEB_URL) {
    return seedCloudFixture(request, fixture)
  }
  return seedLocalFixture(page, fixture)
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
          req.onblocked = () => {
            console.warn(`[afterEach] IndexedDB delete blocked for "${name}"...`)
            resolve()
          }
        })
      }),
    )
    localStorage.clear()
    sessionStorage.clear()
  })
})

// The describe title must contain "items". The project's documented E2E gate grep is
// `--grep "items|shopping|cooking|settings|a11y"` and Playwright matches it against
// the joined title path — project, file path, describes, test title. The filename
// `item-stock-input.spec.ts` has no "items" in it, so without this the whole file is
// silently deselected by the convention. Same reason as item-stock-pager.spec.ts.
test.describe('items stock tab — number input editing', () => {
  test('user can backspace a quantity showing 0 without losing the keystroke or the caret', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk is stocked at My Home with a Packed quantity of 0
    const locationIds = await seedFixture(page, request, baseURL, FIXTURE)
    const form = new StockFormPage(page)
    await form.navigateTo(ITEM)

    const packed = form.getPackedInput()
    await expect(packed).toHaveValue('0')
    // Save starts disabled — the form is clean
    await expect(form.getSaveButton()).toBeDisabled()

    // When the user puts the caret at the end of the field and presses
    // Backspace exactly once
    await form.focusAtEnd(packed)
    await packed.press('Backspace')

    // Then the field is EMPTY. `Number('') === 0` equals the state the field
    // already held, so the old code performed no state change and React wrote
    // "0" straight back into the DOM node.
    await expect(packed).toHaveValue('')

    // And the caret is still in the field — the write-back is what the user
    // read as "it lost focus"
    await expect(packed).toBeFocused()

    // And an empty field is not a change, so Save is still disabled
    await expect(form.getSaveButton()).toBeDisabled()

    // When the user types a digit
    await packed.pressSequentially('5')

    // Then the field holds exactly that digit — not "05", which is what the
    // restored "0" plus the keystroke produced
    await expect(packed).toHaveValue('5')
    await expect(packed).toBeFocused()

    // And the form is dirty, so Save is offered
    await expect(form.getSaveButton()).toBeEnabled()

    // When the user saves
    await form.save()

    // Then the new quantity is persisted to this location's stock row
    await expect
      .poll(async () => {
        const stock = await readStockAt(
          page,
          request,
          baseURL,
          ITEM,
          locationIds[HOME],
        )
        return stock?.packedQuantity
      })
      .toBe(5)
  })

  // Task 2 rebuilt Target Quantity and Refill When Below onto the shared
  // QuantityStepper (+/- buttons around the input), replacing the old
  // grid-cols-2 pair of plain number inputs. This is the round-trip guard for
  // that rebuild: it drives the buttons (not the keyboard), saves, and
  // re-navigates to a fresh mount of the tab so the assertion reads values
  // the loader pulled back off the backend — not values still sitting in the
  // component's already-correct in-memory state. A stepper whose `onStep`
  // got disconnected from its input, or a submit that dropped the field,
  // would still show the right number on screen right up until save; only
  // the reload would catch it. Target and Refill are driven to DIFFERENT
  // final values on purpose: identical values would let a field-swap in the
  // save path (writing targetQuantity from refillThreshold, or vice versa)
  // hide behind a symmetric assertion.
  test('user can adjust Target and Refill with the +/- steppers and have them persist through save and reload', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk is stocked at My Home with Target and Refill both at 0
    const locationIds = await seedFixture(page, request, baseURL, FIXTURE)
    const form = new StockFormPage(page)
    await form.navigateTo(ITEM)

    const targetInput = form.getTargetInput()
    const refillInput = form.getRefillInput()
    await expect(targetInput).toHaveValue('0')
    await expect(refillInput).toHaveValue('0')

    // And the '-' buttons are disabled at 0 (the QuantityStepper clamp)
    await expect(form.getTargetDecreaseButton()).toBeDisabled()
    await expect(form.getRefillDecreaseButton()).toBeDisabled()

    // When the user clicks Increase Target four times and Decrease Target once
    await form.getTargetIncreaseButton().click()
    await form.getTargetIncreaseButton().click()
    await form.getTargetIncreaseButton().click()
    await form.getTargetIncreaseButton().click()
    await form.getTargetDecreaseButton().click()

    // Then Target reads 3 — proving the buttons drive the field's value.
    // Target and Refill are driven to DIFFERENT final values (and both differ
    // from the seeded 0): if the save path ever cross-wired the two fields —
    // writing targetQuantity from refillThreshold's local state or vice versa
    // — identical final values would let that bug hide behind a symmetric
    // assertion. Distinct values make a swap visible.
    await expect(targetInput).toHaveValue('3')

    // When the user clicks Increase Refill twice
    await form.getRefillIncreaseButton().click()
    await form.getRefillIncreaseButton().click()

    // Then Refill reads 2 — deliberately different from Target's 3, and the
    // '-' button is enabled again now the value moved off 0
    await expect(refillInput).toHaveValue('2')
    await expect(form.getRefillDecreaseButton()).toBeEnabled()

    // And the form is dirty, so Save is offered
    await expect(form.getSaveButton()).toBeEnabled()

    // When the user saves
    const beforeSaveUrl = page.url()
    await form.save()
    await page.waitForURL((url) => url.toString() !== beforeSaveUrl, {
      timeout: 10000,
    })

    // Then the new quantities are persisted to this location's stock row —
    // not merely reflected on screen, and not swapped between the two fields
    await expect
      .poll(async () => {
        const stock = await readStockAt(
          page,
          request,
          baseURL,
          ITEM,
          locationIds[HOME],
        )
        return { target: stock?.targetQuantity, refill: stock?.refillThreshold }
      })
      .toEqual({ target: 3, refill: 2 })

    // When the Stock tab is freshly re-navigated to (a new mount, reading
    // whatever the loader pulls back off the backend)
    await form.navigateTo(ITEM)

    // Then it shows the persisted values, each in its own field — the round
    // trip through save held and nothing crossed over
    await expect(form.getTargetInput()).toHaveValue('3')
    await expect(form.getRefillInput()).toHaveValue('2')
  })

  // TWO HALVES OF ONE RULE, and the second half is what makes this a guard.
  // `roundToStep` moved from `onChange` to `onBlur` in 2fe372a1, because
  // rounding on every keystroke destroyed a part-typed decimal ("2.5" landed
  // on 3 before the "5" was pressed). So the rule has a direction each way:
  //
  //   while the field is FOCUSED  -> the exact text typed survives, unrounded
  //   once the field is LEFT      -> it settles to `roundToStep(n, consumeAmount)`
  //
  // The blur half was added on 2026-09-25 (issue #318); before that this test
  // asserted only the focused half. Measured in the `cloud` project, three
  // mutations on ItemForm.tsx:
  //
  //   A. line 285 forced to `const text = String(value)`
  //      -> test 1 RED, this test GREEN (2026-09-24 and 2026-09-25 alike)
  //   B. the whole pre-2fe372a1 shape — no draft text, plus
  //      `onChange: e => setValue(Number(e.target.value))`
  //      -> test 1 RED. This test was reported GREEN on 2026-09-24 against the
  //      then-`consumeAmount: 0` fixture; re-run on 2026-09-25 against the
  //      current `consumeAmount: 1` fixture it is RED, and it fails on the
  //      FOCUSED assertion below, reading "02.5" — the restored "0" with the
  //      typed text after it, which is the bug itself.
  //   C. `normalizeOnBlur` unwired at the Unpacked call site (line 809)
  //      -> test 1 GREEN, and so was every assertion this test had before the
  //      blur was added: the whole spec passed 3 of 3. With the blur it is RED:
  //      `Expected: "3" / Received: "2.5"`.
  //
  // So B is caught by test 1 above whatever this test does. C was caught by
  // nothing in this spec at all until the blur was added. Other spec files
  // were not run against C, so do not read this as "the only guard in the
  // repo". jsdom does assert the same blur rounding (ItemForm.test.tsx lines
  // 584 and 616) — but only a real browser re-renders the input the way the
  // user saw it, which is why this file exists (see the file header).
  //
  // This test DOES depend on the fixture's `consumeAmount: 1`. `roundToStep`
  // rounds to the step's DECIMAL PLACES, not to a multiple of it
  // (apps/web/src/lib/quantityUtils.ts line 14), so a step of 1 has 0 decimal
  // places and 2.5 settles to 3. At `consumeAmount: 0` the helper returns the
  // value untouched and the blur assertion would read 2.5 — but 0 is not a
  // legal fixture value here (see the FIXTURE comment above).
  //
  // `step` is NOT what this test rides on. `step` affects validity and the
  // spinner, not the text the browser keeps while the field has focus, and it
  // is already asserted in jsdom (ItemForm.test.tsx lines 769 and 844).
  test('user can type a decimal into Unpacked without it being rounded mid-keystroke, and it settles to the consume step on blur', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk is stocked at My Home with an Unpacked quantity of 0, and a
    // consume amount of 1
    await seedFixture(page, request, baseURL, FIXTURE)
    const form = new StockFormPage(page)
    await form.navigateTo(ITEM)

    const unpacked = form.getUnpackedInput()
    await expect(unpacked).toHaveValue('0')

    // When the user clears the field and types "2.5"
    await form.focusAtEnd(unpacked)
    await unpacked.press('Backspace')
    await unpacked.pressSequentially('2.5')

    // Then the field holds the text as typed while it is still focused. The
    // intermediate "2." is not a valid number, so the old code resolved it to
    // 0 and clobbered the field — the next keystroke then landed on that "0".
    await expect(unpacked).toHaveValue('2.5')
    await expect(unpacked).toBeFocused()

    // When the user leaves the field
    await unpacked.press('Tab')

    // Then the rounding runs — once, now, and not a keystroke earlier.
    // `roundToStep(2.5, 1)` is 3. The field reads back off the numeric state
    // here, because blur deletes the draft text, so "3" also proves the state
    // moved and not only the text on screen.
    await expect(unpacked).not.toBeFocused()
    await expect(unpacked).toHaveValue('3')
  })
})
