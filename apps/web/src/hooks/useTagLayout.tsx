import { createContext, useCallback, useContext, useState } from 'react'
import {
  type RegisterSaveControl,
  type SaveControl,
  useSaveControlState,
} from './useSaveControl'

interface TagLayoutContextValue {
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

const TagLayoutContext = createContext<TagLayoutContextValue | null>(null)

export function TagLayoutProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false)
  const { saveControl, registerSaveControl } = useSaveControlState()

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <TagLayoutContext.Provider
      value={{
        isDirty,
        registerDirtyState,
        saveControl,
        registerSaveControl,
      }}
    >
      {children}
    </TagLayoutContext.Provider>
  )
}

export function useTagLayout() {
  const context = useContext(TagLayoutContext)
  if (!context) {
    throw new Error('useTagLayout must be used within TagLayoutProvider')
  }
  return context
}
