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
    // dnd-kit sets role="button" on the drag wrapper div, whose text content includes
    // the tag name and item count: "{name} (N)". Match by tag name prefix.
    // (src/routes/settings/tags/index.tsx:123, @dnd-kit/core defaultRole='button')
    return this.page.getByRole('button', { name: new RegExp(`^${name} \\(`) })
  }

  async clickDeleteTag(name: string) {
    // The dnd-kit drag wrapper has role="button" with the tag name text.
    // Inside it, the X delete button (from DeleteButton) is a real <button> element.
    // Navigate into the drag wrapper to find its descendant <button> (the X button).
    // (src/routes/settings/tags/index.tsx:123-155, src/components/DeleteButton/index.tsx)
    const dragWrapper = this.page.getByRole('button', { name: new RegExp(`^${name} \\(`) })
    // The X button is a <button> element (not the drag wrapper itself which is a div)
    await dragWrapper.locator('button').click()
  }

  async clickDeleteTagType(name: string) {
    // aria-label="Delete {tagType.name}" on the trash DeleteButton (src/routes/settings/tags/index.tsx:204)
    await this.page.getByRole('button', { name: `Delete ${name}` }).click()
  }

  async confirmDelete() {
    // AlertDialog confirm button — DeleteButton uses confirmLabel="Delete" by default
    // (src/components/DeleteButton/index.tsx:37, AlertDialogAction renders the label)
    await this.page.getByRole('button', { name: 'Delete' }).click()
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
