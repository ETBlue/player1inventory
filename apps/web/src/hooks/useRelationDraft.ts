import { useCallback, useState } from 'react'

/**
 * The draft of the item Tags, Vendors and Recipes tabs (item relations Save,
 * design `docs/features/items/2026-11-27-item-relations-save-design.md`,
 * *The draft*). A press changes only the screen; the tab's Save sends
 * `shown`.
 *
 * - `added`: ids the person pressed ON while they were off, and new rows
 *   created from the tab.
 * - `removed`: ids the person pressed OFF.
 * - `shown` = `(saved ∪ added) − removed`.
 *
 * Both sets hold only the person's OWN presses on this page. The saved list
 * comes from the server (or Dexie) on every render.
 */
export interface RelationDraftSets {
  added: readonly string[]
  removed: readonly string[]
}

export interface RelationDraftOptions {
  /**
   * `false`: the person may not change the list (a household `member`, the
   * role not known yet, or a manager demoted in another tab). The draft is
   * emptied and a press does nothing (owner answer 5A).
   */
  canEdit?: boolean
  /**
   * `false`: an id may not be added, only removed. The Recipes tab passes
   * `false` for a non-consumable item: the server would refuse the add.
   */
  canAdd?: boolean
}

function without(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id)
}

function isShown(
  sets: RelationDraftSets,
  saved: readonly string[],
  id: string,
) {
  if (sets.removed.includes(id)) return false
  return saved.includes(id) || sets.added.includes(id)
}

/**
 * The press rule. If `id` is shown: take it out of `added` if it is there,
 * else put it in `removed`. If it is not shown: take it out of `removed` if
 * it is there, else put it in `added`. So two presses leave no trace.
 */
export function pressRelation(
  sets: RelationDraftSets,
  saved: readonly string[],
  id: string,
  { canAdd = true }: Pick<RelationDraftOptions, 'canAdd'> = {},
): RelationDraftSets {
  if (isShown(sets, saved, id)) {
    if (sets.added.includes(id)) {
      return { added: without(sets.added, id), removed: [...sets.removed] }
    }
    return { added: [...sets.added], removed: [...sets.removed, id] }
  }
  if (sets.removed.includes(id)) {
    return { added: [...sets.added], removed: without(sets.removed, id) }
  }
  if (!canAdd) return sets
  return { added: [...sets.added, id], removed: [...sets.removed] }
}

export interface RelationCleanUpInput extends RelationDraftSets {
  /** The ids the item has now, from the server or Dexie. */
  saved: readonly string[]
  /**
   * The ids of every row (tag, vendor or recipe) at the previous clean-up.
   * `undefined` while the list had not loaded.
   */
  previousExistingIds: readonly string[] | undefined
  /** The ids of every row now. `undefined` while the list has not loaded. */
  existingIds: readonly string[] | undefined
  canEdit?: boolean
  canAdd?: boolean
}

/**
 * The clean-up on every new saved list (design, *The draft*, the clean-up
 * table). A pure function, so every row of the table is tested on its own.
 *
 * Trap: "the row does not exist" is not "the row was deleted". A row created
 * from the tab enters `added` before the list of rows is read again. So an
 * `added` id leaves the draft only when it WAS in the previous list and is
 * gone now. Dropping every id that is not in the list would show the new
 * badge as not selected when it arrives (issue #402 again).
 */
export function cleanUpRelationDraft({
  saved,
  previousExistingIds,
  existingIds,
  added,
  removed,
  canEdit = true,
  canAdd = true,
}: RelationCleanUpInput): RelationDraftSets {
  if (!canEdit) return { added: [], removed: [] }
  const deleted = (id: string) =>
    previousExistingIds !== undefined &&
    existingIds !== undefined &&
    previousExistingIds.includes(id) &&
    !existingIds.includes(id)
  return {
    added: canAdd
      ? added.filter((id) => !saved.includes(id) && !deleted(id))
      : [],
    removed: removed.filter((id) => saved.includes(id)),
  }
}

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

function sameList(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
) {
  if (a === undefined || b === undefined) return a === b
  return sameIds(a, b)
}

interface DraftState extends RelationDraftSets {
  // What the last clean-up saw, to know when a new one is due
  saved: readonly string[]
  existingIds: readonly string[] | undefined
  canEdit: boolean
  canAdd: boolean
}

export interface RelationDraft extends RelationDraftSets {
  /** `(saved ∪ added) − removed`: saved order first, then added. */
  shown: string[]
  /** `added` or `removed` is not empty. */
  dirty: boolean
  /** A badge press (the press rule). */
  press: (id: string) => void
  /** A row created from the tab: shown as selected, saved by Save. */
  add: (id: string) => void
  /** Empties the draft (after a Save that worked). */
  reset: () => void
}

/**
 * The draft for one tab. `saved` is the item's list now; `existingIds` is
 * every row the tab lists (all tags, all vendors, all recipes), or
 * `undefined` while that list loads.
 *
 * The clean-up runs during render whenever `saved`, `existingIds` or an
 * option changes, so a render never shows a draft that is out of date.
 */
export function useRelationDraft(
  saved: readonly string[],
  existingIds: readonly string[] | undefined,
  { canEdit = true, canAdd = true }: RelationDraftOptions = {},
): RelationDraft {
  const [state, setState] = useState<DraftState>(() => ({
    added: [],
    removed: [],
    saved,
    existingIds,
    canEdit,
    canAdd,
  }))

  let current = state
  if (
    !sameIds(state.saved, saved) ||
    !sameList(state.existingIds, existingIds) ||
    state.canEdit !== canEdit ||
    state.canAdd !== canAdd
  ) {
    const sets = cleanUpRelationDraft({
      saved,
      previousExistingIds: state.existingIds ?? existingIds,
      existingIds,
      added: state.added,
      removed: state.removed,
      canEdit,
      canAdd,
    })
    // While the list has not loaded, keep the last list that was seen, so
    // the "was in the list, gone now" rule still has something to compare
    current = {
      ...sets,
      saved,
      existingIds: existingIds ?? state.existingIds,
      canEdit,
      canAdd,
    }
    // Setting state during render: React renders this component again at
    // once, before it commits, so no render shows the old draft
    setState(current)
  }

  const press = useCallback(
    (id: string) =>
      setState((s) => {
        if (!s.canEdit) return s
        const sets = pressRelation(s, s.saved, id, { canAdd: s.canAdd })
        return sets === s ? s : { ...s, ...sets }
      }),
    [],
  )

  const add = useCallback(
    (id: string) =>
      setState((s) => {
        if (!s.canEdit || !s.canAdd) return s
        if (s.saved.includes(id) && !s.removed.includes(id)) return s
        return {
          ...s,
          added: s.added.includes(id) ? s.added : [...s.added, id],
          removed: without(s.removed, id),
        }
      }),
    [],
  )

  const reset = useCallback(
    () => setState((s) => ({ ...s, added: [], removed: [] })),
    [],
  )

  const shown = [
    ...saved.filter((id) => !current.removed.includes(id)),
    ...current.added.filter(
      (id) => !saved.includes(id) && !current.removed.includes(id),
    ),
  ]

  return {
    added: current.added,
    removed: current.removed,
    shown,
    dirty: current.added.length > 0 || current.removed.length > 0,
    press,
    add,
    reset,
  }
}
