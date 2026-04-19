import { createContext, useCallback, useContext, useState } from 'react'

interface ShelfLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
}

const ShelfLayoutContext = createContext<ShelfLayoutContextValue | null>(null)

export function ShelfLayoutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDirty, setIsDirty] = useState(false)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <ShelfLayoutContext.Provider value={{ isDirty, registerDirtyState }}>
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
