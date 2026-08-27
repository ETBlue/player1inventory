import type { Locator, Page } from '@playwright/test'

// The per-location stock form on the item-detail Stock tab
// (`/items/$id/stock` → `StockFormPanel` → `ItemForm sections={['stock']}`).
//
// This object covers the FIELDS of that form. The pager chrome around it
// (dots, chevrons, add/remove) lives in `StockPagerPage`.
// (src/routes/items/$id/stock.tsx, src/components/item/ItemForm/ItemForm.tsx)
export class StockFormPage {
  constructor(readonly page: Page) {}

  async navigateTo(itemId: string) {
    await this.page.goto(`/items/${itemId}/stock`)
  }

  getPackedInput(): Locator {
    // <Input id="packedQuantity" type="number"> under <Label htmlFor="packedQuantity">
    // → "Packed" (ItemForm.tsx:619-633)
    return this.page.locator('#packedQuantity')
  }

  getUnpackedInput(): Locator {
    // <Input id="unpackedQuantity" type="number"> under <Label htmlFor="unpackedQuantity">
    // → "Unpacked" (ItemForm.tsx:663-687)
    return this.page.locator('#unpackedQuantity')
  }

  getTargetInput(): Locator {
    // <Input id="targetQuantity" type="number"> under <Label htmlFor="targetQuantity">
    // → "Target Quantity" (ItemForm.tsx:712-744)
    return this.page.locator('#targetQuantity')
  }

  getRefillInput(): Locator {
    // <Input id="refillThreshold" type="number"> under <Label htmlFor="refillThreshold">
    // → "Refill When Below" (ItemForm.tsx:746-779)
    return this.page.locator('#refillThreshold')
  }

  // The four QuantityStepper +/- buttons on the Stock tab. Each pair's
  // aria-label is `items.form.<field>.decrease` / `.increase`
  // (en.json: "Decrease Target" / "Increase Target", etc. — ItemForm.tsx
  // QuantityStepper `decreaseLabel`/`increaseLabel` props).
  getTargetIncreaseButton(): Locator {
    return this.page.getByRole('button', { name: 'Increase Target' })
  }

  getTargetDecreaseButton(): Locator {
    return this.page.getByRole('button', { name: 'Decrease Target' })
  }

  getRefillIncreaseButton(): Locator {
    return this.page.getByRole('button', { name: 'Increase Refill' })
  }

  getRefillDecreaseButton(): Locator {
    return this.page.getByRole('button', { name: 'Decrease Refill' })
  }

  getSaveButton(): Locator {
    // The form's only type="submit"; its label is the `submitLabel` prop,
    // default "Save" (ItemForm.tsx:101, 800-806)
    return this.page.getByRole('button', { name: 'Save' })
  }

  // Put the caret at the END of a number input's text without selecting it, so
  // a following Backspace deletes exactly one character. A bare click lands the
  // caret wherever the pointer hit; ArrowUp/Down would change the value, so
  // `End` is the only safe way to normalise the position.
  async focusAtEnd(input: Locator) {
    await input.click()
    await input.press('End')
  }

  async save() {
    await this.getSaveButton().click()
  }
}
