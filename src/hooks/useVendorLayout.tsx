import { createContext, useCallback, useContext, useState } from 'react'

interface VendorLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
}

const VendorLayoutContext = createContext<VendorLayoutContextValue | null>(null)

export function VendorLayoutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDirty, setIsDirty] = useState(false)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <VendorLayoutContext.Provider value={{ isDirty, registerDirtyState }}>
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
