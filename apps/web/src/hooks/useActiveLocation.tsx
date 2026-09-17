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
import { bootstrapCarts, getLocations } from '@/db/operations'
import { useBootstrapCartsMutation } from '@/generated/graphql'
import { useLocations } from '@/hooks/useLocations'
import type { DataMode } from '@/lib/dataMode'
import { DEFAULT_LOCATION_ID, type Location } from '@/types'
import { useDataMode } from './useDataMode'

// The LEGACY localStorage key for the globally active location id, written back
// when both data modes shared one slot. It is read once and migrated into the
// local slot (below), so an existing user is not reset by the upgrade. It can
// only ever have named a *local* location — cloud mode had no locations of its
// own while it was in use — which is why it migrates to 'local' and nowhere else.
export const ACTIVE_LOCATION_STORAGE_KEY = 'active-location-id'

// The active id is stored PER DATA MODE — 'active-location-id:local' /
// 'active-location-id:cloud'. The two modes have disjoint id spaces (local seeds
// the `DEFAULT_LOCATION_ID` sentinel; cloud ids are server-generated cuids), so
// one shared slot hands each mode an id belonging to the other: sign into cloud
// and the stored local id names no cloud location at all.
export function activeLocationStorageKey(mode: DataMode): string {
  return `${ACTIVE_LOCATION_STORAGE_KEY}:${mode}`
}

// Pure read — the legacy key is consulted as a fallback here and moved by
// `migrateLegacyStoredLocationId` below, so this can run during render.
//
// Exported for the CROSS-MODE data paths (import / export / migration), which
// need one mode's id while the app is running in the other. They must not use
// `useActiveLocation().activeLocationId`: since the slot became per-mode that
// is the CURRENT mode's id, and the two id spaces are disjoint.
export function readStoredLocationId(mode: DataMode): string {
  try {
    const stored = localStorage.getItem(activeLocationStorageKey(mode))
    if (stored !== null) return stored
    if (mode === 'local') {
      const legacy = localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY)
      if (legacy !== null) return legacy
    }
    return DEFAULT_LOCATION_ID
  } catch {
    return DEFAULT_LOCATION_ID
  }
}

// Move the legacy bare key into the local slot, once, on first mount. The
// read-through above already keeps an existing user on their location without
// this; the move is what makes it a one-time upgrade rather than a fallback
// consulted forever, and it stops a stale bare key from outliving the choice
// the user later makes in local mode.
function migrateLegacyStoredLocationId(): void {
  try {
    const legacy = localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY)
    if (legacy === null) return
    const localKey = activeLocationStorageKey('local')
    if (localStorage.getItem(localKey) === null) {
      localStorage.setItem(localKey, legacy)
    }
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
  } catch {
    // ignore read/write failures (e.g. private mode)
  }
}

// The local mode's own active location, validated against the LOCAL `locations`
// table — usable from either mode.
//
// A cloud → local copy synthesises `ItemStock` rows and has to place them in
// one location, and that location has to exist in the table those rows are
// written to. `useActiveLocation().activeLocationId` cannot supply it while the
// app is in cloud mode: that id is a server-generated cuid naming a cloud
// `Location`, so stock written under it belongs to no local location and the
// user lands on an empty pantry after the switch.
//
// The fallback rule matches the provider's own validation effect: the local
// `isDefault` row, then any row, then the seed sentinel for a table that has
// not been populated yet.
export async function resolveLocalActiveLocationId(): Promise<string> {
  const stored = readStoredLocationId('local')
  const locations = await getLocations()
  if (locations.some((loc) => loc.id === stored)) return stored
  return (
    locations.find((loc) => loc.isDefault)?.id ??
    locations[0]?.id ??
    DEFAULT_LOCATION_ID
  )
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
  // Always called (Rules of Hooks). Safe in local mode: main.tsx wraps every
  // render with a no-op ApolloProvider, and the cloud effect below never fires.
  const [cloudBootstrapCarts] = useBootstrapCartsMutation()
  const [activeLocationId, setActiveLocationIdState] = useState<string>(() =>
    readStoredLocationId(mode),
  )

  // Re-read the stored id whenever the DATA MODE changes, not only on mount:
  // each mode has its own slot and the id held for one is meaningless in the
  // other. This is React's documented "adjust state when an input changes"
  // pattern — done during render rather than in an effect so children never
  // get a pass with the other mode's id.
  const [lastMode, setLastMode] = useState<DataMode>(mode)
  if (lastMode !== mode) {
    setLastMode(mode)
    setActiveLocationIdState(readStoredLocationId(mode))
  }

  useEffect(() => {
    migrateLegacyStoredLocationId()
  }, [])

  const setActiveLocationId = useCallback(
    (id: string) => {
      setActiveLocationIdState(id)
      try {
        localStorage.setItem(activeLocationStorageKey(mode), id)
      } catch {
        // ignore write failures (e.g. private mode)
      }
    },
    [mode],
  )

  // Once the location list has loaded, an active id matching none of its
  // entries is stale — a deleted location, or an id belonging to the other data
  // mode — and falls back to the user's default location.
  //
  // NO id is special-cased as always-valid. This effect used to return early
  // when the active id equalled `DEFAULT_LOCATION_ID`, which made the local
  // sentinel 'local' permanently "valid" in cloud mode, where it names nothing:
  // it was never corrected and every location-scoped query came back empty —
  // a silently empty pantry rather than a cosmetic fallback.
  //
  // The fallback target is the `isDefault` location, not the `'local'` literal:
  // a cloud default's id is a server-generated cuid (see `Location.isDefault`).
  //
  // A list that has loaded but is EMPTY leaves the active id untouched: there
  // is nothing to point at, and blanking it would discard the user's choice for
  // the moment the list does arrive. An empty list is far more often transient
  // (a refetch in flight, a failed cloud read) than a genuine "no locations" —
  // local seeds a default on populate and the server creates one lazily.
  useEffect(() => {
    if (!locations) return
    if (locations.some((loc) => loc.id === activeLocationId)) return
    const fallbackId =
      locations.find((loc) => loc.isDefault)?.id ?? locations[0]?.id
    if (fallbackId) setActiveLocationId(fallbackId)
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

  // The CLOUD half of the same rule (PR 3b Task 4). `createVendor` pre-creates
  // a vendor's cart at ONE location — the one the caller was looking at — so
  // every other location lacks that vendor's cart until something fills it in.
  // The `bootstrapCarts` mutation is that something, and this is the moment
  // local mode picks to call its own version: when the active location changes.
  //
  // Gated on the active id being in the LOADED location list. On a fresh cloud
  // session `activeLocationId` is still the `'local'` sentinel, which names no
  // cloud `Location`, and `bootstrapCarts` asks for the `member` role on it —
  // so an ungated call is refused with FORBIDDEN and the carts are never
  // created. The validation effect above then corrects the id, this effect
  // re-runs with a real one, and the bootstrap lands. The list itself is the
  // gate here rather than `useCloudLocationKnown`, because this component
  // already holds the list.
  //
  // `AllCarts` is refetched by name so the shopping index picks up the carts
  // that were just created; it is a read of existing rows only. `VendorCart`
  // is NOT refetched — that query creates its own cart when it is missing, so
  // the cart page is already correct without this mutation.
  //
  // No `cancelled` flag, unlike the local effect above: there is no follow-up
  // step here to skip. Apollo owns the refetch, and a location switch while
  // this is in flight simply runs the mutation again for the new location.
  useEffect(() => {
    if (mode !== 'cloud') return
    if (!locations?.some((loc) => loc.id === activeLocationId)) return
    cloudBootstrapCarts({
      variables: { locationId: activeLocationId },
      refetchQueries: ['AllCarts'],
    }).catch((err) => {
      console.error('cloud bootstrapCarts failed', err)
    })
  }, [mode, activeLocationId, locations, cloudBootstrapCarts])

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
// scope its data) default to a location without requiring every test to wrap in
// a provider. Switching is a no-op here.
//
// It KEEPS `DEFAULT_LOCATION_ID` deliberately — this was not missed when the
// provider stopped special-casing the sentinel. There is no location list to
// consult here (that is the provider's job), so the local seed's id is the only
// id available; a provider-less render has no cloud data to scope anyway.
const FALLBACK_ACTIVE_LOCATION: ActiveLocationContextValue = {
  activeLocationId: DEFAULT_LOCATION_ID,
  setActiveLocationId: () => {},
  activeLocation: undefined,
}

export function useActiveLocation(): ActiveLocationContextValue {
  const ctx = useContext(ActiveLocationContext)
  return ctx ?? FALLBACK_ACTIVE_LOCATION
}
