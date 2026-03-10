import type { Page, Locator } from '@playwright/test'

export class TagsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/settings/tags')
  }

  async fillTagTypeName(name: string) {
    // Name input: label htmlFor="newTagTypeName" (src/routes/settings/tags/index.tsx:421)
    await this.page.getByLabel('Name').fill(name)
  }

  async clickNewTagType() {
    // Button label "New Tag Type" (src/routes/settings/tags/index.tsx:435)
    await this.page.getByRole('button', { name: /new tag type/i }).click()
  }

  getTagTypeCard(name: string): Locator {
    // Card heading h3 inside DroppableTagTypeCard (src/routes/settings/tags/index.tsx:194)
    return this.page.getByRole('heading', { name, level: 3 })
  }

  async clickNewTag(tagTypeName: string) {
    // "New Tag" button inside a specific tag type card
    const heading = this.page.getByRole('heading', { name: tagTypeName, level: 3 })
    await heading.locator('xpath=ancestor::*[contains(@class,"relative")][1]')
      .getByRole('button', { name: /new tag/i })
      .click()
  }

  async fillTagName(name: string) {
    // AddNameDialog input placeholder "e.g., Dairy, Frozen" (src/routes/settings/tags/index.tsx:476)
    await this.page.getByPlaceholder(/dairy/i).fill(name)
  }

  async submitTagDialog() {
    // "Add Tag" submit button in AddNameDialog (src/routes/settings/tags/index.tsx:472)
    await this.page.getByRole('button', { name: 'Add Tag' }).click()
  }

  getTagBadge(name: string): Locator {
    // TagBadge renders as a button (src/routes/settings/tags/index.tsx:126)
    return this.page.getByRole('button', { name })
  }

  async clickDeleteTag(name: string) {
    // X button is inside the same inline-flex div as the badge button
    const wrapper = this.page.locator('div.inline-flex').filter({
      has: this.page.getByRole('button', { name })
    })
    await wrapper.getByRole('button').last().click()
  }

  async clickDeleteTagType(name: string) {
    // aria-label="Delete {tagType.name}" on the trash DeleteButton (src/routes/settings/tags/index.tsx:204)
    await this.page.getByRole('button', { name: `Delete ${name}` }).click()
  }

  async confirmDelete() {
    // AlertDialog confirm button
    await this.page.getByRole('button', { name: 'Confirm' }).click()
  }

  async dragTagToType(tagName: string, targetTypeName: string) {
    const source = this.page.getByRole('button', { name: tagName })
    const target = this.page.getByRole('heading', { name: targetTypeName, level: 3 })

    const sourceBox = await source.boundingBox()
    const targetBox = await target.boundingBox()
    if (!sourceBox || !targetBox) throw new Error('Could not get bounding boxes')

    // Move mouse to source center, then past 8px activation threshold, then to target
    await this.page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2,
    )
    await this.page.mouse.down()
    await this.page.mouse.move(
      sourceBox.x + sourceBox.width / 2 + 10,
      sourceBox.y + sourceBox.height / 2,
      { steps: 5 },
    )
    await this.page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 10 },
    )
    await this.page.mouse.up()
  }

  getUndoToast(): Locator {
    // Sonner toast with "Undo" action button (src/routes/settings/tags/index.tsx:371)
    return this.page.getByRole('button', { name: 'Undo' })
  }

  async clickUndo() {
    await this.getUndoToast().click()
  }
}
