import { createContext, useCallback, useContext, useState } from 'react'

interface TagLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
}

const TagLayoutContext = createContext<TagLayoutContextValue | null>(null)

export function TagLayoutProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <TagLayoutContext.Provider value={{ isDirty, registerDirtyState }}>
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
