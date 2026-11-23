// Where a household switch lands when it starts on a settings page (owner
// request 2026-11-23: "stay in the same page after switching household").
//
// The routes, from `src/routes/settings/` (TanStack Router, file-based):
//
// | Page | After the switch |
// |---|---|
// | `/settings`, `/settings/household` | the same page |
// | `/settings/household/{members,activity}` | the same page |
// | `/settings/household/{locations,recipes,shelves,tags,vendors}` | the same page |
// | `/settings/household/<section>/<id>…` (a location's people page, a recipe, shelf, tag or vendor detail page and its tabs) | that section's list page: the id names a row of the OLD household, which the new one does not have |
//
// The search string and the hash are dropped: no settings page reads one.

/** The five sections whose pages below the list name a row id. */
const SECTIONS_WITH_ROW_PAGES = new Set([
  'locations',
  'recipes',
  'shelves',
  'tags',
  'vendors',
])

/**
 * The page to load after a household switch that started at `pathname`, or
 * `null` when `pathname` is not a settings page (the caller then keeps `/`).
 */
export function settingsPathAfterSwitch(pathname: string): string | null {
  const parts = pathname.split('/').filter((part) => part !== '')
  if (parts[0] !== 'settings') return null
  const section = parts[2]
  if (
    parts[1] === 'household' &&
    section !== undefined &&
    SECTIONS_WITH_ROW_PAGES.has(section) &&
    parts.length > 3
  ) {
    return `/settings/household/${section}`
  }
  return `/${parts.join('/')}`
}
