import { createContext, useCallback, useContext, useState } from 'react'

interface ItemLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
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
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <ItemLayoutContext.Provider
      value={{ isDirty, registerDirtyState, saveSlot, setSaveSlot }}
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
