const KEY = 'pantryViewPreference'

export type PantryView = 'list' | 'shelf'

export function getPantryView(): PantryView {
  const stored = localStorage.getItem(KEY)
  if (stored === 'list' || stored === 'shelf') return stored
  return 'shelf' // default for fresh users
}

/**
 * Returns the stored view preference, or null if no preference has been saved.
 * Used to distinguish "explicitly set to shelf" from "nothing stored yet".
 */
export function getStoredPantryView(): PantryView | null {
  const stored = localStorage.getItem(KEY)
  if (stored === 'list' || stored === 'shelf') return stored
  return null
}

export function setPantryView(view: PantryView): void {
  localStorage.setItem(KEY, view)
}
