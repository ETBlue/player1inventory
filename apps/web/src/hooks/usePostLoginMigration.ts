import { useApolloClient } from '@apollo/client/react'
import { useEffect, useRef, useState } from 'react'
import { getAllItems } from '@/db/operations'
import { type ExportPayload, fetchLocalPayload } from '@/lib/exportData'
import {
  type ImportStrategy,
  type ImportTarget,
  importCloudData,
  importErrorKind,
  needsImportLocation,
} from '@/lib/importData'
import { useLocations } from './useLocations'

export const MIGRATION_PROMPTED_KEY = 'migration-prompted'
export const MIGRATION_STRATEGY_KEY = 'migration-strategy'

export type MigrationState =
  | 'idle'
  | 'prompting'
  | 'conflict'
  | 'importing'
  | 'auto-importing'
  // "Import into which location?" is open (households H4 task E.4, decision
  // O3). The copy waits for the user's answer.
  | 'choosing-location'
  | 'done'
  | 'error'

/**
 * Why the copy failed, in the parts the dialog needs.
 *
 * `forbidden` is a refusal because a row belongs to another household.
 * `role` is a refusal because the caller is not an owner or a manager of the
 * household (households H4 decision T17). They decide WHICH sentence the user
 * reads, and they are computed in the `catch` rather than at render time,
 * because only the thrown error carries them. `message` is the raw text,
 * interpolated by the generic sentence alone. For a refusal it is the bare
 * word `Forbidden`, which tells the user nothing.
 */
export type MigrationError = {
  forbidden: boolean
  role: boolean
  message: string
}

// `importErrorKind` is the one detector for these refusals, and `ImportCard`
// uses the same one; see its doc comment in `lib/importData.ts`.
function toMigrationError(
  err: unknown,
  strategy: ImportStrategy,
): MigrationError {
  const kind = importErrorKind(err, strategy)
  return {
    forbidden: kind === 'forbidden' || kind === 'forbiddenAfterClear',
    role: kind === 'role',
    message: err instanceof Error ? err.message : String(err),
  }
}

/** A copy that waits for "Import into which location?". */
type PendingCopy = { payload: ExportPayload; strategy: ImportStrategy }

/**
 * Whether the session is signed in, as the caller sees it.
 *
 * This hook used to call Clerk's `useAuth()` itself. It takes the two values as
 * an argument instead, so the hook can run with no `ClerkProvider` in the tree.
 * `PostLoginMigrationDialog` picks where they come from: Clerk in the real app,
 * a constant in E2E test mode.
 */
export type MigrationAuth = {
  isLoaded: boolean
  isSignedIn: boolean
}

export function usePostLoginMigration({ isLoaded, isSignedIn }: MigrationAuth) {
  const [state, setState] = useState<MigrationState>('idle')
  const [error, setError] = useState<MigrationError | null>(null)
  const [pending, setPending] = useState<PendingCopy | null>(null)
  const apolloClient = useApolloClient()
  const { data: locations } = useLocations()
  // Hold the one-shot auto-import until this account's location list has
  // resolved at least once.
  //
  // PR 4b removed the other half of this gate. Until then the hook also picked
  // ONE local location and passed it to `importCloudData` as the single
  // location whose stock went up, because the cloud import surface was flat.
  // Every location is kept now. Since households H4 task E.4 the one choice
  // left, where the local default `'local'` goes, is asked in
  // "Import into which location?" (`choosing-location` below).
  //
  // Be careful about WHY this half survives. It is NOT what lists the
  // dialog's locations: `useImportTargetLocations` reads them itself, and on
  // `clear` `importCloudData` reads the new "Home" after the clear
  // (`fetchHomeAfterClear` in `importData.ts`). What this gate buys is
  // ordering: the copy is one-shot and destructive on the cloud side, and
  // `clear` deletes every Location row before that read, so starting it while this hook's own
  // GetLocations is still in flight lets a response that predates the clear
  // land in the Apollo cache after it. Waiting for one resolved list keeps the
  // session settled before the destructive write begins.
  const locationsLoaded = locations !== undefined
  // The auto-import is one-shot.
  //
  // `locationsLoaded` is a dependency of the effect below and it is a BOOLEAN,
  // so a location being added or renamed does not re-fire the effect. What does
  // is the list going unknown and then known again: `data` undefined →
  // defined, so the boolean true → false → true.
  //
  // There is a concrete trigger, and it is inside the copy itself.
  // `importCloudData` calls `client.resetStore()` at the end of the `clear`
  // path, which empties the Apollo cache and refetches every active query —
  // including the `GetLocations` behind `useLocations`. During that refetch
  // `cloud.data` is undefined. MIGRATION_PROMPTED_KEY is written only once
  // `importCloudData` RESOLVES, so the window is open while the copy is still
  // running: without this ref the effect re-enters and starts a second `clear`
  // import over the rows the first one just wrote.
  //
  // The same re-run also reaches the prompting branch once a copy has FAILED:
  // the `catch` has removed MIGRATION_STRATEGY_KEY and MIGRATION_PROMPTED_KEY
  // is still unset, so the effect called `setState('prompting')` and replaced
  // 'error'. The user never saw the error and was asked again (bug
  // 2026-10-31, `docs/global/bugs/2026-10-31-bug-cloud-copy-aborted-on-pantry.md`).
  // So the ref covers BOTH copy paths: it is set when the auto-import starts
  // and when `importData` starts, and once it is set the effect does nothing.
  // A refresh mounts the hook again with a fresh ref, so the user can retry.
  const importStarted = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (localStorage.getItem(MIGRATION_PROMPTED_KEY)) return
    if (importStarted.current) return

    const storedStrategy = localStorage.getItem(
      MIGRATION_STRATEGY_KEY,
    ) as ImportStrategy | null

    if (storedStrategy) {
      // Only the auto-import is gated: it is one-shot and destructive on the
      // cloud side. The prompting path below merely decides whether to show the
      // dialog.
      if (!locationsLoaded) return
      importStarted.current = true
      setState('auto-importing')
      fetchLocalPayload()
        .then((payload) => {
          // Local data always has its default location `'local'`, so for
          // `skip` and `replace` the copy asks where it goes first (decision
          // O3: always, even with one location). `clear` does not ask
          // (decision O2). The E2E specs answer the dialog in the page, the
          // same way a person does; there is no key that skips it.
          if (storedStrategy !== 'clear' && needsImportLocation(payload)) {
            setPending({ payload, strategy: storedStrategy })
            setState('choosing-location')
            return
          }
          return importCloudData(payload, storedStrategy, apolloClient).then(
            () => {
              localStorage.removeItem(MIGRATION_STRATEGY_KEY)
              localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
              setState('done')
            },
          )
        })
        .catch((err) => {
          // The copy failed. The state is 'error', so the dialog tells the user
          // so and gives them a button to close it. It used to be 'done', which
          // closed the dialog as if the copy had worked and left the user in a
          // half-copied account with no message at all.
          //
          // Both localStorage decisions are unchanged, and for the same two
          // reasons as before:
          //   - MIGRATION_STRATEGY_KEY is removed, so the next mount does not
          //     take the auto-import branch again and loop on the same failure.
          //   - MIGRATION_PROMPTED_KEY stays unset, so a refresh still offers
          //     the copy and the user can retry.
          localStorage.removeItem(MIGRATION_STRATEGY_KEY)
          setError(toMigrationError(err, storedStrategy))
          setState('error')
        })
      return
    }

    getAllItems().then((items) => {
      // An import may have started while `getAllItems()` was in flight.
      if (importStarted.current) return
      if (items.length > 0) {
        setState('prompting')
      } else {
        localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
      }
    })
  }, [isLoaded, isSignedIn, apolloClient, locationsLoaded])

  function dismiss() {
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

  // The body is wrapped because `PostLoginMigrationDialog` calls this from
  // `onClick={() => importData('append')}` and does not await it. Without the
  // catch a failed copy was an unhandled promise rejection: nothing set a new
  // state, so the dialog stayed on 'importing' — the Import button disabled and
  // reading '...' — for the rest of the session.
  async function importData(conflictResolution: 'append' | 'replace') {
    importStarted.current = true
    setState('importing')
    const strategy = conflictResolution === 'replace' ? 'replace' : 'skip'
    try {
      const payload = await fetchLocalPayload()
      if (needsImportLocation(payload)) {
        setPending({ payload, strategy })
        setState('choosing-location')
        return
      }
      await importCloudData(payload, strategy, apolloClient)
      localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
      setState('done')
    } catch (err) {
      setError(toMigrationError(err, strategy))
      setState('error')
    }
  }

  // The answer of "Import into which location?". Runs the copy that was
  // waiting for it, from either path.
  async function chooseLocation(target: ImportTarget) {
    if (pending === null) return
    const { payload, strategy } = pending
    setPending(null)
    setState('importing')
    try {
      await importCloudData(payload, strategy, apolloClient, { target })
      localStorage.removeItem(MIGRATION_STRATEGY_KEY)
      localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
      setState('done')
    } catch (err) {
      localStorage.removeItem(MIGRATION_STRATEGY_KEY)
      setError(toMigrationError(err, strategy))
      setState('error')
    }
  }

  // Cancel in "Import into which location?": nothing is copied, and the user
  // is asked again whether to copy at all, with the Skip button the prompt
  // already has. The stored strategy is removed, so a reload does not start
  // the copy again by itself.
  function cancelLocation() {
    setPending(null)
    localStorage.removeItem(MIGRATION_STRATEGY_KEY)
    setState('prompting')
  }

  return {
    state,
    error,
    dismiss,
    importData,
    chooseLocation,
    cancelLocation,
    pendingPayload: pending?.payload,
  }
}
