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
    // Name input inside the New/Edit Tag Type dialog (TagTypeInfoForm, label "Name")
    // The dialog must be open before calling this method.
    // (src/routes/settings/tags/index.tsx — TagTypeInfoForm inside Dialog)
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
  }

  async clickNewTagType() {
    // Button label "New Tag Type" — opens the tag type creation dialog
    // (src/routes/settings/tags/index.tsx)
    await this.page.getByRole('button', { name: /new tag type/i }).click()
  }

  async submitTagTypeDialog() {
    // Save button inside the New/Edit Tag Type dialog (TagTypeInfoForm renders t('common.save') = "Save")
    // (src/routes/settings/tags/index.tsx — TagTypeInfoForm inside Dialog)
    await this.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  }

  getTagTypeCard(name: string): Locator {
    // Card heading h2 inside DroppableTagTypeCard (src/routes/settings/tags/index.tsx:194)
    return this.page.getByRole('heading', { name, level: 2 })
  }

  async clickNewTag(tagTypeName: string) {
    // "New Tag" button inside a specific tag type card
    const heading = this.page.getByRole('heading', { name: tagTypeName, level: 2 })
    await heading.locator('xpath=ancestor::*[contains(@class,"relative")][1]')
      .getByRole('button', { name: /new tag/i })
      .click()
  }

  async fillTagName(name: string) {
    // TagInfoForm Name input: label htmlFor="tag-name", label text "Name"
    // Scoped to the open dialog to avoid conflict with other "Name" inputs on the page.
    // (src/components/tag/TagInfoForm/index.tsx:82-90)
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
  }

  async selectTagParent(parentName: string) {
    // TagInfoForm Parent Select: label htmlFor="tag-parent", label text "Parent Tag"
    // Opens a Radix Select and chooses the given parent option.
    // (src/components/tag/TagInfoForm/index.tsx:129-150)
    await this.page.getByRole('dialog').getByLabel('Parent Tag').click()
    await this.page.getByRole('option', { name: parentName }).click()
  }

  async submitTagDialog() {
    // Save button inside the Add Tag dialog (TagInfoForm renders t('common.save') = "Save")
    // (src/components/tag/TagInfoForm/index.tsx:152-158)
    await this.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  }

  getTagBadge(name: string): Locator {
    // dnd-kit sets role="button" on the drag wrapper div, whose text content includes
    // the tag name and item count: "{name} (N)". Match by tag name prefix.
    // (src/routes/settings/tags/index.tsx:123, @dnd-kit/core defaultRole='button')
    return this.page.getByRole('button', { name: new RegExp(`^${name} \\(`) })
  }

  async clickTagBadgeToNavigate(name: string) {
    // Click the tag badge to navigate to its detail page. The TagBadge inside the dnd-kit
    // drag wrapper has an onClick that calls navigate(). A plain click (< 8px movement)
    // passes through the PointerSensor without activating drag mode.
    // (src/routes/settings/tags/index.tsx:131-136)
    await this.getTagBadge(name).click()
  }

  async clickDeleteTag(name: string) {
    // DeleteButton is a sibling of the drag wrapper (not nested inside it), per a11y refactor
    // to avoid nested interactive elements (src/routes/settings/tags/index.tsx:147).
    // Use aria-label: t('settings.tags.tag.deleteAriaLabel') = 'Delete "{{name}}"'
    await this.page.getByRole('button', { name: `Delete "${name}"` }).click()
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
    // The dnd-kit drag wrapper has role="button" and text "{tagName} (N)"
    // Listeners are on the drag wrapper div. Target is the tag type heading area.
    // (src/routes/settings/tags/index.tsx:123, @dnd-kit/core PointerSensor activation=8px)
    const source = this.page.getByRole('button', { name: new RegExp(`^${tagName} \\(`) })
    const target = this.page.getByRole('heading', { name: targetTypeName, level: 2 })

    const sourceBox = await source.boundingBox()
    const targetBox = await target.boundingBox()
    if (!sourceBox || !targetBox) throw new Error('Could not get bounding boxes')

    const sx = sourceBox.x + sourceBox.width / 2
    const sy = sourceBox.y + sourceBox.height / 2
    const tx = targetBox.x + targetBox.width / 2
    const ty = targetBox.y + targetBox.height / 2

    // Move to source, press, move slowly past 8px threshold, then to target
    await this.page.mouse.move(sx, sy)
    await this.page.mouse.down()
    // Small nudge to pass the 8px PointerSensor activation distance
    await this.page.mouse.move(sx + 10, sy, { steps: 10 })
    // Move to target in many steps to keep dnd-kit active
    await this.page.mouse.move(tx, ty, { steps: 30 })
    await this.page.mouse.up()
  }

  getUndoToast(): Locator {
    // Sonner toast with "Undo" action button (src/routes/settings/tags/index.tsx:371)
    return this.page.getByRole('button', { name: 'Undo' })
  }

  async clickUndo() {
    await this.getUndoToast().click()
  }

  async cancelDeleteDialog() {
    // Cancel button in the AlertDialog — rendered as "Cancel" text (src/components/ui/alert-dialog.tsx)
    await this.page.getByRole('button', { name: 'Cancel' }).click()
  }

  getDeleteDialog(): import('@playwright/test').Locator {
    // The AlertDialog element — use to scope content assertions inside the dialog
    // (src/components/DeleteButton/index.tsx, src/components/ui/alert-dialog.tsx)
    return this.page.getByRole('alertdialog')
  }
}
