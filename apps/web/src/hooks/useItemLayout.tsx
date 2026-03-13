import { createContext, useCallback, useContext, useState } from 'react'

interface ItemLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
}

const ItemLayoutContext = createContext<ItemLayoutContextValue | null>(null)

export function ItemLayoutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDirty, setIsDirty] = useState(false)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <ItemLayoutContext.Provider value={{ isDirty, registerDirtyState }}>
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
