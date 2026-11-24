import { createContext, useCallback, useContext, useState } from 'react'
import {
  type RegisterSaveControl,
  type SaveControl,
  useSaveControlState,
} from './useSaveControl'

interface RecipeLayoutContextValue {
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

const RecipeLayoutContext = createContext<RecipeLayoutContextValue | null>(null)

export function RecipeLayoutProvider({
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
    <RecipeLayoutContext.Provider
      value={{
        isDirty,
        registerDirtyState,
        saveControl,
        registerSaveControl,
      }}
    >
      {children}
    </RecipeLayoutContext.Provider>
  )
}

export function useRecipeLayout() {
  const context = useContext(RecipeLayoutContext)
  if (!context) {
    throw new Error('useRecipeLayout must be used within RecipeLayoutProvider')
  }
  return context
}
