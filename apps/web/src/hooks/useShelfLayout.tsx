import { createContext, useCallback, useContext, useState } from 'react'
import {
  type RegisterSaveControl,
  type SaveControl,
  useSaveControlState,
} from './useSaveControl'

interface ShelfLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
  /**
   * The Info form's save, for the unsaved-changes dialog's Save button
   * (`components/shared/UnsavedChangesDialog`). `null` while no form is
   * mounted. The form registers it with `registerSaveControl`.
   */
  saveControl: SaveControl | null
  registerSaveControl: RegisterSaveControl
}

const ShelfLayoutContext = createContext<ShelfLayoutContextValue | null>(null)

export function ShelfLayoutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDirty, setIsDirty] = useState(false)
  const { saveControl, registerSaveControl } = useSaveControlState()

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <ShelfLayoutContext.Provider
      value={{
        isDirty,
        registerDirtyState,
        saveControl,
        registerSaveControl,
      }}
    >
      {children}
    </ShelfLayoutContext.Provider>
  )
}

export function useShelfLayout() {
  const context = useContext(ShelfLayoutContext)
  if (!context) {
    throw new Error('useShelfLayout must be used within ShelfLayoutProvider')
  }
  return context
}
