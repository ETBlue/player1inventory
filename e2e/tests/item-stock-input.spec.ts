import { expect, type Page, test } from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { readRows, seedRows } from '../helpers/locationSeed'
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
// Locations are local-first — there is no cloud Location or ItemStock backend —
// so the fixture, and therefore every test here, is local-only.

const HOME = 'local' // DEFAULT_LOCATION_ID, seeded as "My Home"
const ITEM = 'item-milk'

test.beforeEach(async ({ page }) => {
  // Prevent the empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.afterEach(async ({ page }) => {
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

// One location, one item, one stock row — every quantity at 0, which is what a
// plain `createItem` leaves behind and exactly the state the bug needed.
// `seedRows` resolves on `tx.oncomplete`, never on `request.onsuccess`: an
// IDBRequest succeeds while its transaction is still open, and the navigation
// that follows a seed aborts it, silently discarding the rows.
async function seedFixture(page: Page) {
  // Dexie must have created the schema before we open the database by name.
  await page.goto('/')
  const now = new Date()

  await seedRows(page, 'locations', [
    { id: HOME, name: 'My Home', order: 0, createdAt: now, updatedAt: now },
  ])
  await seedRows(page, 'items', [
    {
      id: ITEM,
      name: 'Milk',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      // The create default since 6302ee97 — an item is born with no consume
      // step, so Unpacked's blur-time rounding falls back to a step of 1.
      consumeAmount: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(page, 'itemStocks', [
    {
      id: 'stock-home',
      itemId: ITEM,
      locationId: HOME,
      // Every quantity at zero: the field the user backspaces shows "0".
      packedQuantity: 0,
      unpackedQuantity: 0,
      targetQuantity: 0,
      refillThreshold: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

// The describe title must contain "items". The project's documented E2E gate grep is
// `--grep "items|shopping|cooking|settings|a11y"` and Playwright matches it against
// the joined title path — project, file path, describes, test title. The filename
// `item-stock-input.spec.ts` has no "items" in it, so without this the whole file is
// silently deselected by the convention. Same reason as item-stock-pager.spec.ts.
test.describe('items stock tab — number input editing', () => {
  test('user can backspace a quantity showing 0 without losing the keystroke or the caret', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given Milk is stocked at My Home with a Packed quantity of 0
    await seedFixture(page)
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
        const stocks = await readRows(page, 'itemStocks')
        return stocks.find((s) => s.locationId === HOME)?.packedQuantity
      })
      .toBe(5)
  })

  // Task 2 rebuilt Target Quantity and Refill When Below onto the shared
  // QuantityStepper (+/- buttons around the input), replacing the old
  // grid-cols-2 pair of plain number inputs. This is the round-trip guard for
  // that rebuild: it drives the buttons (not the keyboard), saves, and
  // re-navigates to a fresh mount of the tab so the assertion reads values
  // the loader pulled back off IndexedDB — not values still sitting in the
  // component's already-correct in-memory state. A stepper whose `onStep`
  // got disconnected from its input, or a submit that dropped the field,
  // would still show the right number on screen right up until save; only
  // the reload would catch it. Target and Refill are driven to DIFFERENT
  // final values on purpose: identical values would let a field-swap in the
  // save path (writing targetQuantity from refillThreshold, or vice versa)
  // hide behind a symmetric assertion.
  test('user can adjust Target and Refill with the +/- steppers and have them persist through save and reload', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given Milk is stocked at My Home with Target and Refill both at 0
    await seedFixture(page)
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
        const stocks = await readRows(page, 'itemStocks')
        const stock = stocks.find((s) => s.locationId === HOME)
        return { target: stock?.targetQuantity, refill: stock?.refillThreshold }
      })
      .toEqual({ target: 3, refill: 2 })

    // When the Stock tab is freshly re-navigated to (a new mount, reading
    // whatever the loader pulls back off IndexedDB)
    await form.navigateTo(ITEM)

    // Then it shows the persisted values, each in its own field — the round
    // trip through save held and nothing crossed over
    await expect(form.getTargetInput()).toHaveValue('3')
    await expect(form.getRefillInput()).toHaveValue('2')
  })

  test('user can type a decimal into Unpacked without it being rounded mid-keystroke', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given Milk is stocked at My Home with an Unpacked quantity of 0
    await seedFixture(page)
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
  })
})
