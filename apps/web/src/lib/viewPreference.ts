const KEY = 'pantryViewPreference'
const GROUP_BY_KEY = 'pantry-group-by'

export type PantryView = 'list' | 'group'

export type PantryGroupBy = 'shelf' | 'vendor' | 'recipe'

export function getPantryView(): PantryView {
  const stored = localStorage.getItem(KEY)
  if (stored === 'list') return 'list'
  if (stored === 'shelf' || stored === 'group') return 'group'
  return 'group' // default for fresh users
}

/**
 * Returns the stored view preference, or null if no preference has been saved.
 * Used to distinguish "explicitly set to group" from "nothing stored yet".
 */
export function getStoredPantryView(): PantryView | null {
  const stored = localStorage.getItem(KEY)
  if (stored === 'list') return 'list'
  if (stored === 'shelf' || stored === 'group') return 'group'
  return null
}

export function setPantryView(view: PantryView): void {
  localStorage.setItem(KEY, view)
}

export function getStoredGroupBy(): PantryGroupBy {
  const stored = localStorage.getItem(GROUP_BY_KEY)
  if (stored === 'shelf' || stored === 'vendor' || stored === 'recipe')
    return stored
  return 'shelf'
}

export function setStoredGroupBy(g: PantryGroupBy): void {
  localStorage.setItem(GROUP_BY_KEY, g)
}
