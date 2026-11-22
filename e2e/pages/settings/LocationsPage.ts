import { expect, type Locator, type Page } from '@playwright/test'
import { withSteps } from '../step'

/** `s` with every RegExp special character escaped. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The labels of the **Sort by** choices (`settings.locations.sort.*`). */
export type LocationSortLabel =
  | 'Custom'
  | 'Name'
  | 'Last updated'
  | 'Last visited'

/**
 * Settings › Locations and the location switcher (households H7b task M.5).
 *
 * | Part | Where in apps/web/src | Found by |
 * |---|---|---|
 * | the list | `components/location/LocationList/LocationList.tsx`, inside `<main>` | an element whose whole text is one of the names asked for |
 * | **Sort by** | `components/location/LocationSortSelect/LocationSortSelect.tsx` | `combobox` named "Sort by" (`settings.locations.sortBy`, through `aria-labelledby`) |
 * | a sort choice | the same file | `option` named by its label (`settings.locations.sort.*`) |
 * | a drag handle | `LocationList.tsx` | button "Drag to reorder {name}" (`settings.locations.dragToReorder`), shown only with Custom |
 * | the switcher | `components/shared/LocationSwitcher/LocationSwitcher.tsx`, the desktop sidebar copy, on the pantry (`openPantry`) | button "Switch location…" (`locationSwitcher.triggerLabel`), then one `menuitem` per location |
 *
 * The list is read inside `<main>`. The settings pages show the household
 * sidebar, which has no location switcher, so the switcher methods need a
 * page that has the main sidebar: call `openPantry` first.
 */
export class LocationsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  async navigateTo() {
    await this.page.goto('/settings/household/locations')
  }

  /** The pantry, which shows the main sidebar with the location switcher. */
  async openPantry() {
    await this.page.goto('/')
    await expect(this.switcher()).toBeVisible()
  }

  main(): Locator {
    return this.page.getByRole('main')
  }

  /** Every element in `<main>` whose whole text is one of `names`, in page order. */
  nameCells(names: readonly string[]): Locator {
    const pattern = names.map(escapeRegExp).join('|')
    return this.main().locator(`text=/^(${pattern})$/`)
  }

  /**
   * The names of the list, in the order shown, limited to `names`. Other rows
   * are left out. Use it inside `expect.poll`: the list may still be loading.
   */
  async listedNames(names: readonly string[]): Promise<string[]> {
    return this.nameCells(names).allTextContents()
  }

  /** Waits until the list shows exactly `expected`, in this order. */
  async expectOrder(expected: readonly string[]) {
    await expect
      .poll(() => this.listedNames(expected), { timeout: 10_000 })
      .toEqual([...expected])
  }

  sortSelect(): Locator {
    return this.main().getByRole('combobox', { name: 'Sort by' })
  }

  /** The open list of sort choices. Radix renders it in a portal. */
  sortOptions(): Locator {
    return this.page.getByRole('listbox')
  }

  async openSortSelect() {
    await this.sortSelect().click()
    await expect(this.sortOptions()).toBeVisible()
  }

  async chooseSort(label: LocationSortLabel) {
    await this.openSortSelect()
    await this.sortOptions()
      .getByRole('option', { name: label, exact: true })
      .click()
    await expect(this.sortSelect()).toHaveText(label)
  }

  dragHandle(name: string): Locator {
    return this.page.getByRole('button', { name: `Drag to reorder ${name}` })
  }

  /**
   * Drags the row `name` above the row `target`. dnd-kit's PointerSensor
   * starts a drag only after 8 px, so the mouse moves in steps (the same
   * moves as the reorder test in `settings/locations.spec.ts`).
   */
  async dragAbove(name: string, target: string) {
    const from = await this.dragHandle(name).boundingBox()
    const to = await this.dragHandle(target).boundingBox()
    if (!from || !to)
      throw new Error(`drag handles not found: ${name}, ${target}`)
    await this.page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2,
    )
    await this.page.mouse.down()
    await this.page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2 - 12,
      { steps: 5 },
    )
    await this.page.mouse.move(to.x + to.width / 2, to.y - 4, { steps: 10 })
    await this.page.mouse.up()
  }

  switcher(): Locator {
    return this.page
      .getByRole('navigation', { name: 'Sidebar navigation' })
      .getByRole('button', { name: /switch location/i })
  }

  /**
   * The names in the switcher menu, in order, limited to `names`. A row's
   * text may hold more than the name ("Kitchen View only"), so each row is
   * matched to the name it starts with.
   */
  async switcherNames(names: readonly string[]): Promise<string[]> {
    await this.switcher().click()
    const menu = this.page.getByRole('menu')
    for (const name of names) {
      await expect(
        menu.getByRole('menuitem', {
          name: new RegExp(`^${escapeRegExp(name)}`),
        }),
      ).toBeVisible()
    }
    const texts = await menu.getByRole('menuitem').allInnerTexts()
    await this.page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    return texts.flatMap((text) => {
      const found = names.find((name) => text.trim().startsWith(name))
      return found ? [found] : []
    })
  }

  /** Makes `name` the active location through the sidebar switcher. */
  async pickInSwitcher(name: string) {
    await this.switcher().click()
    await this.page.getByRole('menuitem', { name, exact: true }).click()
    await expect(this.switcher()).toHaveText(name)
  }
}
