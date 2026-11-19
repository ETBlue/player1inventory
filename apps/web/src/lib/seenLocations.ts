/**
 * A small link between `ActiveLocationProvider` and the code paths where the
 * person removes locations THEMSELVES (households H5c task H.7, review).
 *
 * The provider shows "You no longer have access to {location}." when the
 * active location leaves the list (owner decision O27-A). That is right when
 * someone else removed the person, or deleted the location. It is wrong when
 * the person just did it: they pressed Delete, or ran a `clear` import, which
 * deletes every location and makes a new one. Those paths call
 * `expectLocationLoss` first, so the loss shows no toast.
 *
 * Why a module and not a context function: the `clear` import runs in
 * `lib/importData.ts`, plain code with no React context, and `clearCache`
 * (sign-out) lives in `apollo/persistence.ts`. The module holds no state of
 * its own, only a pointer to the MOUNTED provider's handle. The provider sets
 * it on mount and removes it on unmount, so the seen ids still belong to one
 * page visit (decision T45), and with no provider every call does nothing.
 */
export interface SeenLocationsHandle {
  /**
   * The person is about to remove these locations themselves (every seen
   * location when `ids` is left out). Their loss shows no toast. Returns a
   * function that takes the mark back, for a write that failed.
   */
  expectLoss(ids?: readonly string[]): () => void
  /** Forget every seen location (sign-out: the next person is someone else). */
  forget(): void
}

let mounted: SeenLocationsHandle | null = null

/** For `ActiveLocationProvider` only. Returns the function that unregisters. */
export function registerSeenLocations(handle: SeenLocationsHandle): () => void {
  mounted = handle
  return () => {
    if (mounted === handle) mounted = null
  }
}

export function expectLocationLoss(ids?: readonly string[]): () => void {
  return mounted?.expectLoss(ids) ?? (() => {})
}

export function forgetSeenLocations(): void {
  mounted?.forget()
}
