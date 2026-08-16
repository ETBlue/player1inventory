import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { bootstrapCarts } from '@/db/operations'
import { useLocations } from '@/hooks/useLocations'
import { DEFAULT_LOCATION_ID, type Location } from '@/types'
import { useDataMode } from './useDataMode'

// localStorage key for the globally active location id. Mirrors the naming of
// other preference keys (e.g. 'theme-preference', 'pantry-group-by').
export const ACTIVE_LOCATION_STORAGE_KEY = 'active-location-id'

function readStoredLocationId(): string {
  try {
    return (
      localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY) ?? DEFAULT_LOCATION_ID
    )
  } catch {
    return DEFAULT_LOCATION_ID
  }
}

interface ActiveLocationContextValue {
  activeLocationId: string
  setActiveLocationId: (id: string) => void
  activeLocation: Location | undefined
}

const ActiveLocationContext = createContext<ActiveLocationContextValue | null>(
  null,
)

export function ActiveLocationProvider({ children }: { children: ReactNode }) {
  const { data: locations } = useLocations()
  const { mode } = useDataMode()
  const queryClient = useQueryClient()
  const [activeLocationId, setActiveLocationIdState] = useState<string>(() =>
    readStoredLocationId(),
  )

  const setActiveLocationId = useCallback((id: string) => {
    setActiveLocationIdState(id)
    try {
      localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, id)
    } catch {
      // ignore write failures (e.g. private mode)
    }
  }, [])

  // If the stored/active id no longer matches any existing location (e.g. it was
  // deleted), fall back to the default. Only runs once the location list has
  // loaded — avoids resetting before data is available.
  useEffect(() => {
    if (!locations) return
    if (activeLocationId === DEFAULT_LOCATION_ID) return
    const exists = locations.some((loc) => loc.id === activeLocationId)
    if (!exists) {
      setActiveLocationId(DEFAULT_LOCATION_ID)
    }
  }, [locations, activeLocationId, setActiveLocationId])

  // `getCart` is a pure read (see db/operations.ts) — it no longer creates a
  // missing cart on demand. Bootstrap the no-vendor + per-vendor carts for
  // whichever location is active, then invalidate any cart query that may
  // have already resolved before the bootstrap finished. Local mode only:
  // cloud mode's carts live behind Apollo/GraphQL, not local Dexie.
  //
  // `cancelled` guards the in-flight promise's success path settling after
  // this effect's cleanup: it skips the (now-pointless) invalidation instead
  // of surfacing an unhandled promise rejection from a stale closure. The
  // `.catch` is intentionally NOT gated on `cancelled` — a real bootstrap
  // failure (e.g. a genuine Dexie error) is worth logging even when it
  // resolves after the effect was superseded by a location switch; that is
  // exactly the case where losing the log would hide the most.
  useEffect(() => {
    if (mode !== 'local') return
    let cancelled = false
    bootstrapCarts(activeLocationId)
      .then(() => {
        if (!cancelled) queryClient.invalidateQueries({ queryKey: ['cart'] })
      })
      .catch((err) => {
        console.error('bootstrapCarts failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [mode, activeLocationId, queryClient])

  const activeLocation = useMemo(
    () => locations?.find((loc) => loc.id === activeLocationId),
    [locations, activeLocationId],
  )

  const value = useMemo<ActiveLocationContextValue>(
    () => ({ activeLocationId, setActiveLocationId, activeLocation }),
    [activeLocationId, setActiveLocationId, activeLocation],
  )

  return (
    <ActiveLocationContext.Provider value={value}>
      {children}
    </ActiveLocationContext.Provider>
  )
}

// Fallback used when no ActiveLocationProvider is mounted. In the real app the
// provider is always mounted in __root.tsx; this fallback exists so that
// isolated unit/story renders (and any hook now reading the active location to
// scope its data) default to the single default location ('local') without
// requiring every test to wrap in a provider. Switching is a no-op here.
const FALLBACK_ACTIVE_LOCATION: ActiveLocationContextValue = {
  activeLocationId: DEFAULT_LOCATION_ID,
  setActiveLocationId: () => {},
  activeLocation: undefined,
}

export function useActiveLocation(): ActiveLocationContextValue {
  const ctx = useContext(ActiveLocationContext)
  return ctx ?? FALLBACK_ACTIVE_LOCATION
}
