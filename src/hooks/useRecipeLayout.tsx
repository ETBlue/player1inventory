import { createContext, useCallback, useContext, useState } from 'react'

interface RecipeLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
}

const RecipeLayoutContext = createContext<RecipeLayoutContextValue | null>(null)

export function RecipeLayoutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDirty, setIsDirty] = useState(false)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <RecipeLayoutContext.Provider value={{ isDirty, registerDirtyState }}>
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
