import { useEffect } from 'react'
import { useItemLayout } from './useItemLayout'
import { useRegisterSaveControl } from './useSaveControl'

export interface RelationTabSaveInput {
  /** The tab's draft differs from the saved list. */
  dirty: boolean
  /** A Save is running. */
  isPending: boolean
  /** The person may change the list (`usePermissions().canEditCatalog`). */
  canEdit: boolean
  /**
   * Saves the draft. Answers `true` when it worked and `false` when it
   * failed (after the tab has shown its error toast). Never rejects.
   */
  save: () => Promise<boolean>
}

export interface RelationTabSave {
  /** The top bar Save may be pressed now. */
  canSave: boolean
  /**
   * Where `TopBarSaveButton` goes. `null` when the person may not change the
   * list (no Save at all), or before the top bar has mounted.
   */
  saveSlot: HTMLElement | null
}

/**
 * What the item Tags, Vendors and Recipes tabs need from the item layout,
 * the same three things `ItemForm` gives the Info and Stock tabs (design
 * `docs/features/items/2026-11-27-item-relations-save-design.md`, *The Save
 * button and the layout*):
 *
 * - the dirty state for the unsaved-changes guard, and `false` on unmount;
 * - the `SaveControl` for the dialog's Save, with
 *   `canSave = dirty && !isPending && canEdit`;
 * - the top bar slot for the Save button.
 *
 * Read only (`canEdit` false): it reports `dirty: false`, registers no
 * `SaveControl` and returns no slot.
 */
export function useRelationTabSave({
  dirty,
  isPending,
  canEdit,
  save,
}: RelationTabSaveInput): RelationTabSave {
  const { registerDirtyState, registerSaveControl, saveSlot } = useItemLayout()
  const reportedDirty = canEdit && dirty

  useEffect(() => {
    registerDirtyState(reportedDirty)
  }, [reportedDirty, registerDirtyState])

  useEffect(() => () => registerDirtyState(false), [registerDirtyState])

  const canSave = dirty && !isPending && canEdit
  useRegisterSaveControl(
    canEdit ? registerSaveControl : undefined,
    canSave,
    save,
  )

  return { canSave, saveSlot: canEdit ? saveSlot : null }
}
