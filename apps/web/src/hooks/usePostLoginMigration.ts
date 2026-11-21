import { useApolloClient } from '@apollo/client/react'
import { useEffect, useRef, useState } from 'react'
import { getShownHouseholdId } from '@/apollo/householdGuard'
import { getAllItems } from '@/db/operations'
import type { HouseholdRole } from '@/generated/graphql'
import { type ExportPayload, fetchLocalPayload } from '@/lib/exportData'
import {
  type ImportStrategy,
  type ImportTarget,
  importCloudData,
  importErrorKind,
  needsImportLocation,
} from '@/lib/importData'
import { useLocations } from './useLocations'
import {
  useCreateAnotherHousehold,
  useSwitchHousehold,
} from './useMyHouseholds'

export const MIGRATION_PROMPTED_KEY = 'migration-prompted'
export const MIGRATION_STRATEGY_KEY = 'migration-strategy'
/**
 * The households where "Copy local data?" is never asked: a JSON list of
 * household ids. The join page adds the household it joins (owner decision
 * O12-A: local data is not copied into a household the person joins).
 *
 * It is a list of households, not a flag. Until 2026-11-19 the join set
 * `MIGRATION_PROMPTED_KEY`, which turns the question off on this device for
 * EVERY household, also one the person creates later as its owner
 * (docs/global/bugs/2026-11-19-bug-join-turns-off-copy-prompt.md).
 */
export const MIGRATION_SKIP_HOUSEHOLDS_KEY = 'migration-skip-households'

/**
 * The household a copy waits for, across one reload (households H7 task L.5,
 * decision T73, owner decision O22-A). The person chose ANOTHER household
 * for their offline data. The page must move there first, because the reload
 * is what clears the old household's cache, and `importCloudData` reads that
 * cache to find conflicts. So the hook stores the chosen id here, the page
 * moves, and after the reload the stored copy runs at once, without the
 * question, in that household only.
 *
 * The rules, the same as `HOUSEHOLD_CHANGED_NOTICE_KEY`'s:
 * - `sessionStorage`, not `localStorage`: the choice was made in ONE tab, and
 *   only that tab may run the copy. `sessionStorage` survives the tab's
 *   reload and its `location.replace`.
 * - Every access is in try/catch (`takeCopyIntoHousehold`,
 *   `storeCopyIntoHousehold`). Storage that throws means "no choice stored":
 *   the question shows again.
 * - It is read ONCE and removed at that moment, before the copy starts. So
 *   a second reload, or a reload in the middle of the copy, cannot copy
 *   twice. It then only asks the question again.
 * - The copy runs only when the id is the household the page really shows:
 *   the `household` answer AND `getShownHouseholdId()`. Never the shared
 *   `last-household-id` key, which another tab may have changed.
 */
export const COPY_INTO_HOUSEHOLD_KEY = 'copy-into-household'

function storeCopyIntoHousehold(householdId: string): void {
  try {
    sessionStorage.setItem(COPY_INTO_HOUSEHOLD_KEY, householdId)
  } catch {
    // Lost: after the reload the question shows again.
  }
}

function forgetCopyIntoHousehold(): void {
  try {
    sessionStorage.removeItem(COPY_INTO_HOUSEHOLD_KEY)
  } catch {
    // Nothing to do.
  }
}

/** Read the stored id and remove it, or `null`. Never throws. */
function takeCopyIntoHousehold(): string | null {
  let value: string | null = null
  try {
    value = sessionStorage.getItem(COPY_INTO_HOUSEHOLD_KEY)
  } catch {
    return null
  }
  forgetCopyIntoHousehold()
  return value
}

/** The skipped household ids. A missing or broken value is an empty list. */
export function readSkippedHouseholds(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(MIGRATION_SKIP_HOUSEHOLDS_KEY) ?? '[]',
    )
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

/** Never ask "Copy local data?" in this household on this device. */
export function skipCopyPromptIn(householdId: string): void {
  const ids = readSkippedHouseholds()
  if (ids.includes(householdId)) return
  localStorage.setItem(
    MIGRATION_SKIP_HOUSEHOLDS_KEY,
    JSON.stringify([...ids, householdId]),
  )
}

/**
 * The pages where the question waits: the join page and the sign-in page.
 *
 * A person who opens an invite link is on their way into another household.
 * A brand-new person already has a household of their own there (their
 * first request made it), and a copy into it would keep it from being
 * deleted when they join. The sign-in page is on the same path: Clerk
 * reports "signed in" a moment before it leaves for the invite link. The
 * question waits; it is not answered. If the person leaves without joining,
 * it comes on the next page.
 */
export function isCopyPromptPausedPath(pathname: string): boolean {
  return pathname.startsWith('/join/') || pathname === '/sign-in'
}

export type MigrationState =
  | 'idle'
  // "Copy your offline data into {household}?" is open (owner decision
  // O22-A). A stored strategy waits here for Copy here or Don't copy.
  | 'confirming'
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

/**
 * Where the person chose to copy, when it is not the household the page
 * shows: another household they are in, or a new one (task L.5). A new
 * household's blank name is sent as `null`, so the server picks the default.
 */
export type CopyElsewhere =
  | { householdId: string }
  | { newHouseholdName: string }

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

/**
 * The household a copy would go into: its id, its name and the caller's role.
 * The id is compared with `MIGRATION_SKIP_HOUSEHOLDS_KEY`.
 */
export type MigrationHousehold = {
  id: string
  name: string
  role: HouseholdRole
}

/**
 * What the hook needs from its caller. `household` is `undefined` while the
 * household is loading, and while the person is in no household
 * (`NO_HOUSEHOLD`). Then both questions wait and nothing is shown: the
 * stored copy's, and the one with no stored strategy (since
 * docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md).
 */
export type MigrationInput = MigrationAuth & {
  household: MigrationHousehold | undefined
  /**
   * `true` on a page where nothing may be asked yet (`isCopyPromptPausedPath`).
   * The hook does nothing while it is `true`, and stores nothing.
   */
  paused?: boolean
}

/**
 * Whether the caller's household role lets the copy run (households H4
 * decision T17, plan O1). A `member` cannot import at all. A `manager` can,
 * except `clear`: that deletes the household's data first, and the server
 * allows it to the `owner` only (`importCheck` with `forClear`).
 *
 * Both copy questions read this so they never offer a copy the server will
 * refuse: the stored copy's (owner decision O22-A) with its stored strategy,
 * and the one with no stored strategy with `skip`, the strategy its Copy here
 * runs (docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md).
 * The server still checks; this only picks what the dialog shows.
 */
export function canCopyInto(
  role: HouseholdRole,
  strategy: ImportStrategy,
): boolean {
  if (role === 'owner') return true
  if (role === 'manager') return strategy !== 'clear'
  return false
}

export function usePostLoginMigration({
  isLoaded,
  isSignedIn,
  household,
  paused = false,
}: MigrationInput) {
  const [state, setState] = useState<MigrationState>('idle')
  const [error, setError] = useState<MigrationError | null>(null)
  const [pending, setPending] = useState<PendingCopy | null>(null)
  // The stored strategy, while "Copy your offline data into …?" is open.
  const [waiting, setWaiting] = useState<ImportStrategy | null>(null)
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
  // The second gate of the stored copy (owner decision O22-A). The copy asks
  // first, naming the household, so it waits until the name and the role are
  // known. A person in no household has none: the copy waits, and the strategy
  // key stays stored, until they create or join one. A boolean for the same
  // reason as `locationsLoaded`: a rename must not re-fire the effect.
  const householdLoaded = household !== undefined
  // The id, for the skip list. A string, so a rename does not re-fire the
  // effect; a move to another household does.
  const householdId = household?.id
  // The role, for the copy that runs after a move (task L.5). A string too.
  const householdRole = household?.role
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
  // So the ref covers BOTH copy paths: it is set when the stored copy's
  // confirm opens (owner decision O22-A; before that, when the auto-import
  // started) and when `importData` starts, and once it is set the effect does
  // nothing.
  // A refresh mounts the hook again with a fresh ref, so the user can retry.
  const importStarted = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (paused) return
    if (localStorage.getItem(MIGRATION_PROMPTED_KEY)) return
    if (importStarted.current) return

    // A household the person joined is never offered the copy (owner
    // decision O12-A). Check it before both paths: a manager could copy,
    // so `canCopyInto` would not stop it. While some household is skipped,
    // wait until the household is known: it may be that one.
    const skipped = readSkippedHouseholds()
    if (skipped.length > 0) {
      if (householdId === undefined) return
      if (skipped.includes(householdId)) return
    }

    const storedStrategy = localStorage.getItem(
      MIGRATION_STRATEGY_KEY,
    ) as ImportStrategy | null

    if (storedStrategy) {
      // Only the stored copy waits for the location list: it is one-shot and
      // destructive on the cloud side. Both paths wait for the household.
      if (!locationsLoaded || !householdLoaded) return
      // `importStarted` is set here already, so a re-run of the effect cannot
      // ask twice or start a copy.
      importStarted.current = true
      // The person already chose this household, in this tab, before the
      // page moved here (task L.5). Run the copy without asking again. The
      // stored id is removed now, whatever it names.
      const chosen = takeCopyIntoHousehold()
      if (
        chosen !== null &&
        chosen === householdId &&
        chosen === getShownHouseholdId() &&
        householdRole !== undefined &&
        canCopyInto(householdRole, storedStrategy)
      ) {
        runStoredCopyRef.current(storedStrategy)
        return
      }
      // Ask before copying (owner decision O22-A). The strategy may have
      // been chosen long ago, while the person was in no household, and the
      // household they are in now may be shared.
      setWaiting(storedStrategy)
      setState('confirming')
      return
    }

    // The question with no stored strategy names the household and reads the
    // role too (docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md),
    // so it waits for the household the same way. Nothing is stored while it
    // waits, so a person in no household is asked once they are in one.
    if (!householdLoaded) return
    // A stored choice with no stored strategy is left over (the strategy was
    // removed, for example by a copy in another tab). Drop it.
    takeCopyIntoHousehold()

    getAllItems()
      .then((items) => {
        // An import may have started while `getAllItems()` was in flight.
        if (importStarted.current) return
        if (items.length > 0) {
          setState('prompting')
        } else {
          localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
        }
      })
      .catch((err) => {
        // The local database could not be read (blocked or closed IndexedDB,
        // a private window). Log it; there is no dialog to show it in. Stay
        // 'idle' and leave MIGRATION_PROMPTED_KEY unset, like the other
        // failures in this hook, so the next run of this effect (or a
        // refresh) reads again. Without this catch the failure was an
        // unhandled rejection (docs/global/bugs/
        // 2026-11-18-bug-post-login-migration-unhandled-read.md).
        console.error('Could not read the local items to offer a copy', err)
      })
  }, [
    isLoaded,
    isSignedIn,
    paused,
    locationsLoaded,
    householdLoaded,
    householdId,
    householdRole,
  ])

  // Copy here. Runs the stored copy, as it ran before the confirm existed:
  // "Import into which location?" for `skip` and `replace`, none for `clear`.
  function confirmCopy() {
    if (waiting === null) return
    runStoredCopy(waiting)
  }

  // The stored copy, into the household the page shows. Called by Copy here,
  // and by the effect after the page moved to the household the person chose.
  function runStoredCopy(storedStrategy: ImportStrategy) {
    setWaiting(null)
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
        //     take the stored-copy branch again and loop on the same failure.
        //   - MIGRATION_PROMPTED_KEY stays unset, so a refresh still offers
        //     the copy and the user can retry.
        localStorage.removeItem(MIGRATION_STRATEGY_KEY)
        setError(toMigrationError(err, storedStrategy))
        setState('error')
      })
  }

  // Copy into another household, or a new one (task L.5, decision T73).
  // The page moves there first; the copy runs after the reload (see
  // `COPY_INTO_HOUSEHOLD_KEY`). Nothing is copied before the move. The
  // strategy is the stored one, or `skip` for the question with no stored
  // strategy (what its Copy here runs); it is stored for the reload.
  //
  // `beforeSwitch` runs after the server has answered, so nothing is stored
  // for a refused move. When the move fails after that (the cache could not
  // be cleared), the stored id goes again, and so does a strategy this call
  // stored. The dialog stays open and says the move failed.
  const { switchTo } = useSwitchHousehold()
  const { createAndSwitch } = useCreateAnotherHousehold()
  const [moving, setMoving] = useState(false)
  const [moveFailed, setMoveFailed] = useState(false)

  async function copyElsewhere(target: CopyElsewhere): Promise<void> {
    if (moving) return
    const strategy: ImportStrategy | null =
      state === 'confirming' ? waiting : state === 'prompting' ? 'skip' : null
    if (strategy === null) return
    const storesStrategy = state === 'prompting'
    // No effect run may start a copy or ask again while the page moves.
    importStarted.current = true
    setMoving(true)
    setMoveFailed(false)
    let stored = false
    const beforeSwitch = (id: string) => {
      stored = true
      storeCopyIntoHousehold(id)
      if (storesStrategy) {
        try {
          localStorage.setItem(MIGRATION_STRATEGY_KEY, strategy)
        } catch {
          // Lost: after the reload nothing is copied and nothing is asked.
        }
      }
    }
    try {
      if ('householdId' in target) {
        await switchTo(target.householdId, { beforeSwitch })
      } else {
        await createAndSwitch(target.newHouseholdName, { beforeSwitch })
      }
      // The page is about to load again: stay "moving".
    } catch (err) {
      if (stored) {
        forgetCopyIntoHousehold()
        if (storesStrategy) {
          try {
            localStorage.removeItem(MIGRATION_STRATEGY_KEY)
          } catch {
            // Nothing to do.
          }
        }
      }
      console.error('Could not move to the household for the copy', err)
      setMoving(false)
      setMoveFailed(true)
    }
  }

  // The effect calls the newest `runStoredCopy` through this ref. As a
  // dependency the function would re-run the effect on every render.
  const runStoredCopyRef = useRef(runStoredCopy)
  runStoredCopyRef.current = runStoredCopy

  // Don't copy (and the one button a person who cannot copy gets). The
  // stored strategy is removed, so the copy never runs. MIGRATION_PROMPTED_KEY
  // is set, the same as `dismiss`, so the next load does not ask again with
  // the question that has no stored strategy. Local data on the device is
  // not touched.
  // A copy is still possible later, from Settings (`ImportCard`).
  function declineCopy() {
    setWaiting(null)
    localStorage.removeItem(MIGRATION_STRATEGY_KEY)
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

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
    confirmCopy,
    declineCopy,
    // The stored strategy while state is 'confirming', else null.
    waitingStrategy: waiting,
    importData,
    chooseLocation,
    cancelLocation,
    pendingPayload: pending?.payload,
    copyElsewhere,
    // `true` while the page moves to the chosen household (task L.5).
    moving,
    // `true` after a move for the copy failed. The page did not move.
    moveFailed,
  }
}
