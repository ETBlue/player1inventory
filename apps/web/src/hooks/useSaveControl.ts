import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * What a page's form gives its layout, so the layout's unsaved-changes dialog
 * can save (design `docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md`).
 *
 * - `canSave`: the form's own Save could be pressed now (no field error, the
 *   form is dirty, no save running, not read only).
 * - `save`: runs the SAME save code as the form's own Save, and answers
 *   whether it worked. It never rejects: a failure has already shown its
 *   message (the usual error toast). It never navigates: the settings pages
 *   go back after their own Save, but the caller of `save` decides where to
 *   go.
 */
export interface SaveControl {
  canSave: boolean
  save: () => Promise<boolean>
}

export type RegisterSaveControl = (control: SaveControl | null) => void

/** For a layout provider: the form's current control, and how to set it. */
export function useSaveControlState() {
  const [saveControl, setSaveControl] = useState<SaveControl | null>(null)
  // `setSaveControl` would read a function as an updater; a SaveControl is
  // an object, so it is safe, but wrapped anyway to keep the type narrow.
  const registerSaveControl = useCallback<RegisterSaveControl>((control) => {
    setSaveControl(control)
  }, [])
  return { saveControl, registerSaveControl }
}

/**
 * For a form: hands `{ canSave, save }` to `register` while the form is
 * mounted, and `null` when it unmounts. `save` may be a new function on every
 * render; the control keeps one stable function that calls the latest one, so
 * the layout re-renders only when `canSave` changes.
 */
export function useRegisterSaveControl(
  register: RegisterSaveControl | undefined,
  canSave: boolean,
  save: () => Promise<boolean>,
) {
  const saveRef = useRef(save)
  saveRef.current = save
  const stableSave = useCallback(() => saveRef.current(), [])

  useEffect(() => {
    register?.({ canSave, save: stableSave })
  }, [register, canSave, stableSave])

  useEffect(() => {
    if (!register) return
    return () => register(null)
  }, [register])
}
