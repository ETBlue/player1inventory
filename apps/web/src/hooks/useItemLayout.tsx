import { createContext, useCallback, useContext, useState } from 'react'
import {
  type RegisterSaveControl,
  type SaveControl,
  useSaveControlState,
} from './useSaveControl'

interface ItemLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
  /**
   * The Info form's save, for the unsaved-changes dialog's Save button
   * (`components/shared/UnsavedChangesDialog`). `null` while no form is
   * mounted. The form registers it with `registerSaveControl`.
   */
  saveControl: SaveControl | null
  registerSaveControl: RegisterSaveControl
  /**
   * The place in the item page's top bar where the current tab's Save goes
   * (owner decision 2026-11-25, design 2026-11-24 part B, row 1). `$id.tsx`
   * renders it and registers it with `setSaveSlot`; the Info and Stock tabs
   * pass it to `ItemForm` as `submitSlot`. `null` until the top bar has
   * mounted.
   */
  saveSlot: HTMLElement | null
  setSaveSlot: (element: HTMLElement | null) => void
}

const ItemLayoutContext = createContext<ItemLayoutContextValue | null>(null)

export function ItemLayoutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDirty, setIsDirty] = useState(false)
  const { saveControl, registerSaveControl } = useSaveControlState()
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <ItemLayoutContext.Provider
      value={{
        isDirty,
        registerDirtyState,
        saveControl,
        registerSaveControl,
        saveSlot,
        setSaveSlot,
      }}
    >
      {children}
    </ItemLayoutContext.Provider>
  )
}

export function useItemLayout() {
  const context = useContext(ItemLayoutContext)
  if (!context) {
    throw new Error('useItemLayout must be used within ItemLayoutProvider')
  }
  return context
}
