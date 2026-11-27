import { createContext, useCallback, useContext, useState } from 'react'
import {
  type RegisterSaveControl,
  type SaveControl,
  useSaveControlState,
} from './useSaveControl'

interface VendorLayoutContextValue {
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

const VendorLayoutContext = createContext<VendorLayoutContextValue | null>(null)

export function VendorLayoutProvider({
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
    <VendorLayoutContext.Provider
      value={{
        isDirty,
        registerDirtyState,
        saveControl,
        registerSaveControl,
      }}
    >
      {children}
    </VendorLayoutContext.Provider>
  )
}

export function useVendorLayout() {
  const context = useContext(VendorLayoutContext)
  if (!context) {
    throw new Error('useVendorLayout must be used within VendorLayoutProvider')
  }
  return context
}
