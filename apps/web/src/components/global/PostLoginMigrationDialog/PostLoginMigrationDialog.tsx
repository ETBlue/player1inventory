import { useAuth } from '@clerk/react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImportLocationDialog } from '@/components/settings/ImportLocationDialog'
import { DeleteButton } from '@/components/shared/DeleteButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { HouseholdRole } from '@/generated/graphql'
import { useHousehold } from '@/hooks/useHousehold'
import { useImportTargetLocations } from '@/hooks/useImportTargetLocations'
import { type HouseholdChoice, useMyHouseholds } from '@/hooks/useMyHouseholds'
import {
  type CopyElsewhere,
  canCopyInto,
  type MigrationAuth,
  type MigrationHousehold,
  readSkippedHouseholds,
  usePostLoginMigration,
} from '@/hooks/usePostLoginMigration'
import {
  defaultImportLocationName,
  type ImportStrategy,
} from '@/lib/importData'

// E2E test mode. `VITE_E2E_TEST_USER_ID` makes `main.tsx` render the cloud tree
// with NO `ClerkProvider`, so `useAuth()` throws there.
const isE2ETestMode = !!import.meta.env.VITE_E2E_TEST_USER_ID

/**
 * THIS COMPONENT MOUNTS IN E2E TEST MODE TOO, and that is a change to shipped
 * code made so a test can reach a destructive path. `usePostLoginMigration`
 * runs the `clear` import, which deletes every cloud row for the account before
 * writing the copy. Issue #334 needed that path driven end to end, and the only
 * way in is through this component, so `__root.tsx` now mounts it in cloud mode
 * whether or not the run is E2E.
 *
 * What keeps it from firing in a spec that did not ask for it: the hook needs a
 * `migration-strategy` key in `localStorage`, and the cloud Playwright project
 * seeds only `data-mode` into each context (`e2e/playwright.config.ts`, the
 * `cloud` project's `storageState`). Every test gets a fresh browser context,
 * so no spec inherits another spec's key.
 *
 * The split below copies `DataModeCard`'s: one component that calls Clerk and
 * one that does not, chosen by the build-time flag.
 */
type DialogProps = {
  /**
   * `true` on the join and sign-in pages (`isCopyPromptPausedPath`), where
   * nothing may be asked yet. `__root.tsx` passes it from the router. A prop,
   * not a router hook here, so the dialog renders without a router.
   */
  paused?: boolean
}

export function PostLoginMigrationDialog({ paused = false }: DialogProps) {
  return isE2ETestMode ? (
    <PostLoginMigrationDialogE2E paused={paused} />
  ) : (
    <PostLoginMigrationDialogWithClerk paused={paused} />
  )
}

// Inner component that calls useAuth() — only rendered when not in E2E mode
function PostLoginMigrationDialogWithClerk({ paused }: { paused: boolean }) {
  const { isLoaded, isSignedIn } = useAuth()
  return (
    <MigrationDialogs
      isLoaded={isLoaded}
      isSignedIn={!!isSignedIn}
      paused={paused}
    />
  )
}

// E2E shim — no Clerk context needed.
//
// Reporting the session as loaded and signed in is honest here: with
// `E2E_TEST_MODE` the server takes the `x-e2e-user-id` header as the identity
// (`apps/web/src/apollo/client.ts`, `createApolloClientForE2E`), so every
// request the migration makes is authenticated.
function PostLoginMigrationDialogE2E({ paused }: { paused: boolean }) {
  return <MigrationDialogs isLoaded isSignedIn paused={paused} />
}

// The radio value of "A new household". Not a household id: a server id is
// a cuid and never starts with a space.
const NEW_HOUSEHOLD = ' new'

/** One row of the household choice (task L.5). */
type CopyTargetOption = { id: string; name: string; role: HouseholdRole }

/**
 * The households the copy may go into, in the order the choice lists them
 * (households H7 task L.5, decision T73):
 *
 * 1. the household the page shows, when the role there allows the copy;
 * 2. every other household of `myHouseholds` where it does, in that list's
 *    order (oldest membership first), but not one in
 *    `migration-skip-households` (a household the person joined on this
 *    device; owner decision O12-A).
 *
 * `canCopyInto(role, strategy)` decides, the same rule as the server: a
 * member never, a manager not for `clear`. An empty list means the person
 * may copy nowhere they are now. Then the dialog shows today's sentence and
 * Done, and does not offer "A new household" either.
 */
export function copyTargetOptions(
  current: MigrationHousehold,
  households: HouseholdChoice[] | undefined,
  strategy: ImportStrategy,
  skipped: string[],
): CopyTargetOption[] {
  const options: CopyTargetOption[] = []
  if (canCopyInto(current.role, strategy)) options.push(current)
  for (const other of households ?? []) {
    if (other.id === current.id) continue
    if (skipped.includes(other.id)) continue
    if (!canCopyInto(other.role, strategy)) continue
    options.push({ id: other.id, name: other.name, role: other.role })
  }
  return options
}

/**
 * The household choice: a radio group of `options`, then "A new household"
 * with a name field when it is picked. Household names render as stored,
 * with no `capitalize`. Each radio's name is its visible label: the
 * household name and the person's role there.
 */
function CopyTargetChoice({
  options,
  selected,
  onSelect,
  newName,
  onNewName,
  disabled,
}: {
  options: CopyTargetOption[]
  selected: string
  onSelect: (value: string) => void
  newName: string
  onNewName: (value: string) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="space-y-2">
      <p id={`${id}-label`} className="text-sm font-medium text-foreground">
        {t('settings.postLoginMigration.chooseLabel')}
      </p>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={selected}
        onValueChange={onSelect}
        disabled={disabled}
        className="max-h-64 overflow-y-auto"
      >
        {options.map((option) => (
          <div key={option.id} className="flex items-center gap-2">
            <RadioGroupItem value={option.id} id={`${id}-${option.id}`} />
            <Label
              htmlFor={`${id}-${option.id}`}
              className="min-w-0 cursor-pointer break-words font-normal"
            >
              <span>{option.name}</span>{' '}
              <span className="text-foreground-muted">
                ({t(`roles.household.${option.role}`)})
              </span>
            </Label>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <RadioGroupItem value={NEW_HOUSEHOLD} id={`${id}-new`} />
          <Label htmlFor={`${id}-new`} className="cursor-pointer font-normal">
            {t('settings.postLoginMigration.newHousehold')}
          </Label>
        </div>
      </RadioGroup>
      {selected === NEW_HOUSEHOLD && (
        <Input
          aria-label={t('settings.postLoginMigration.newHouseholdName')}
          placeholder={t('settings.postLoginMigration.newHouseholdName')}
          value={newName}
          disabled={disabled}
          onChange={(event) => onNewName(event.target.value)}
        />
      )}
    </div>
  )
}

function MigrationDialogs({
  isLoaded,
  isSignedIn,
  paused,
}: MigrationAuth & { paused: boolean }) {
  // The household a stored copy would go into (owner decision O22-A).
  // `undefined` while it loads, and when the person is in no household: then
  // the stored copy waits. A cached household next to a NO_HOUSEHOLD error is
  // a household the person has left (`useHousehold`'s `errorCode`), so it is
  // not offered either.
  const householdQuery = useHousehold()
  const household: MigrationHousehold | undefined =
    householdQuery.data !== undefined &&
    householdQuery.errorCode !== 'NO_HOUSEHOLD'
      ? {
          id: householdQuery.data.id,
          name: householdQuery.data.name,
          role: householdQuery.data.role,
        }
      : undefined
  const {
    state,
    error,
    dismiss,
    confirmCopy,
    declineCopy,
    waitingStrategy,
    importData,
    chooseLocation,
    cancelLocation,
    pendingPayload,
    copyElsewhere,
    moving,
    moveFailed,
  } = usePostLoginMigration({
    isLoaded,
    isSignedIn,
    household,
    paused,
  })
  const { t } = useTranslation()
  const choosingLocation = state === 'choosing-location'
  const targetLocations = useImportTargetLocations(choosingLocation)

  // `importData('append')` IS THE COPY. It used to be reached two ways: either
  // straight from the Import button for a single-location pantry, or through
  // `MigrationLocationWarningDialog`'s confirm button for a multi-location one.
  //
  // Cloud locations PR 4b deleted that dialog, because the copy keeps every
  // location now and the warning stopped being true. So the Import button
  // (Copy here since 2026-11-19) calls `importData('append')` directly, and the whole read behind the
  // warning went with it: a TanStack Query over the LOCAL `locations` table
  // plus `resolveLocalActiveLocationId`, which existed only to name the
  // location being copied and the ones being left behind. Nothing is left
  // behind, so there is nothing to name and nothing to hold the button for.

  const confirming =
    state === 'confirming' &&
    household !== undefined &&
    waitingStrategy !== null

  // The question with no stored strategy (local items, `migration-prompted`
  // unset) asks the same way, naming the household
  // (docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md).
  // Its Copy here runs `importData('append')`, which is the `skip` strategy,
  // so a manager may copy and a member may not. A member gets the sentence
  // and Done, like the stored copy, and never reaches "Import into which
  // location?". The hook waits for the household before it asks, so
  // `household` is set here; the check keeps the dialog shut if it is not.
  const prompting =
    (state === 'prompting' || state === 'importing') && household !== undefined

  // The household choice (households H7 task L.5, decision T73). Both
  // questions show it: the stored copy's (`confirming`, its stored strategy)
  // and the one with no stored strategy (`prompting`, `skip`). The household
  // the page shows is selected first. Picking another one, or "A new
  // household", moves the page there first; the copy runs after the reload.
  const myHouseholds = useMyHouseholds()
  const [choice, setChoice] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const choiceStrategy: ImportStrategy | null =
    state === 'confirming'
      ? waitingStrategy
      : state === 'prompting' || state === 'importing'
        ? 'skip'
        : null
  const options =
    household !== undefined && choiceStrategy !== null
      ? copyTargetOptions(
          household,
          myHouseholds.data,
          choiceStrategy,
          readSkippedHouseholds(),
        )
      : []
  // Derived, not copied into state: the list of households arrives after the
  // first render. A pick that is no longer listed falls back to the first.
  const selected =
    choice !== null &&
    (choice === NEW_HOUSEHOLD || options.some((o) => o.id === choice))
      ? choice
      : (options[0]?.id ?? null)
  const selectedOption = options.find((o) => o.id === selected)
  const isNew = selected === NEW_HOUSEHOLD
  // `true` when the copy goes into the household the page shows: today's
  // path, unchanged.
  const isHere = household !== undefined && selected === household.id
  const elsewhere: CopyElsewhere | null = isNew
    ? { newHouseholdName: newName }
    : selectedOption !== undefined && !isHere
      ? { householdId: selectedOption.id }
      : null

  const canCopy = confirming && options.length > 0
  const canPromptCopy = prompting && options.length > 0

  // The title names where the copy goes.
  const title = isNew
    ? t('settings.postLoginMigration.newHouseholdTitle')
    : t('settings.postLoginMigration.confirmTitle', {
        household: selectedOption?.name ?? household?.name ?? '',
      })

  // What the copy does, for the selected target.
  function copyDescription() {
    if (isNew) return t('settings.postLoginMigration.newHouseholdNote')
    return (
      <>
        {t('settings.postLoginMigration.confirmDescription')}
        {selectedOption?.role !== 'owner' && (
          <> {t('settings.postLoginMigration.confirmShared')}</>
        )}
        {!isHere && selectedOption !== undefined && (
          <>
            {' '}
            {t('settings.postLoginMigration.moveNote', {
              household: selectedOption.name,
            })}
          </>
        )}
      </>
    )
  }

  // The button: Copy here for the household the page shows; for another
  // one or a new one the page moves first, and the label says so.
  const copyLabel = isHere
    ? t('settings.postLoginMigration.copyHere')
    : t('settings.postLoginMigration.moveAndCopy')
  function copyThere() {
    if (elsewhere !== null) void copyElsewhere(elsewhere)
  }

  const choiceBlock = (
    <>
      <CopyTargetChoice
        options={options}
        selected={selected ?? NEW_HOUSEHOLD}
        onSelect={setChoice}
        newName={newName}
        onNewName={setNewName}
        disabled={moving}
      />
      {moveFailed && (
        <p
          role="alert"
          className="text-sm text-importance-destructive-foreground"
        >
          {t('settings.postLoginMigration.moveError')}
        </p>
      )}
    </>
  )

  return (
    <>
      {/* "Copy your offline data into {household}?" (owner decision O22-A).
          A stored copy waits here before it runs. Copy here runs it as
          before, with "Import into which location?" for skip and replace.
          Don't copy removes the stored strategy. A person whose role cannot
          copy (a member; a manager with clear) gets no Copy here, only a
          sentence and one button that does the same as Don't copy. */}
      <AlertDialog open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </AlertDialogHeader>
          {canCopy ? (
            <AlertDialogDescription>{copyDescription()}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription>
              {waitingStrategy === 'clear' && household?.role === 'manager'
                ? t('settings.postLoginMigration.cannotCopyClear')
                : t('settings.postLoginMigration.cannotCopyMember')}
            </AlertDialogDescription>
          )}
          {canCopy && choiceBlock}
          <AlertDialogFooter>
            {canCopy ? (
              <>
                <AlertDialogCancel onClick={declineCopy} disabled={moving}>
                  {t('settings.postLoginMigration.dontCopy')}
                </AlertDialogCancel>
                {waitingStrategy === 'clear' && selectedOption !== undefined ? (
                  // A stored `clear` copy deletes the household's catalog
                  // and every location first, the same as Clear household.
                  // So Copy here opens `DeleteButton`'s typed-name confirm,
                  // which works only when the household name is typed
                  // EXACTLY (owner decision O40, households H6 task K.0).
                  // `canCopyInto` lets only the owner copy with `clear`.
                  // For another household the name is typed BEFORE the page
                  // moves there, because after the reload the copy runs at
                  // once (task L.5). "A new household" has nothing to
                  // delete, so it asks no name.
                  <DeleteButton
                    trigger={copyLabel}
                    buttonVariant="destructive"
                    disabled={moving}
                    dialogTitle={t(
                      'settings.postLoginMigration.clearConfirmTitle',
                      { household: selectedOption.name },
                    )}
                    dialogDescription={t(
                      'settings.postLoginMigration.clearConfirmDescription',
                      { household: selectedOption.name },
                    )}
                    confirmLabel={copyLabel}
                    confirmName={selectedOption.name}
                    confirmNameLabel={t('settings.household.danger.typeName', {
                      name: selectedOption.name,
                    })}
                    // `confirmCopy` only starts the copy. The progress and
                    // error dialogs below show the rest.
                    onDelete={isHere ? confirmCopy : copyThere}
                  />
                ) : (
                  <AlertDialogAction
                    onClick={isHere ? confirmCopy : copyThere}
                    disabled={moving}
                  >
                    {copyLabel}
                  </AlertDialogAction>
                )}
              </>
            ) : (
              <AlertDialogAction onClick={declineCopy}>
                {t('common.done')}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-import progress dialog — no buttons, user already chose strategy */}
      <AlertDialog open={state === 'auto-importing'}>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.autoImporting')}
            </AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>

      {/* "Import into which location?" before the copy (households H4 task
          E.4, decision O3). Mounted only while it is open, so its name field
          starts with the local default location's name. */}
      {choosingLocation && pendingPayload !== undefined && (
        <ImportLocationDialog
          open
          locations={targetLocations.data}
          loadError={targetLocations.isError}
          defaultNewName={defaultImportLocationName(pendingPayload)}
          onConfirm={chooseLocation}
          onCancel={cancelLocation}
        />
      )}

      {/* "Copy your offline data into {household}?" with no stored
          strategy. Copy here copies with `skip`, after "Import into which
          location?". Don't copy sets `migration-prompted`. A member gets
          the sentence and one Done button, which does the same as Don't
          copy. The server still checks the role; a refusal shows the error
          dialog below. */}
      <AlertDialog open={prompting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {canPromptCopy
              ? copyDescription()
              : t('settings.postLoginMigration.cannotCopyMember')}
          </AlertDialogDescription>
          {canPromptCopy && choiceBlock}
          <AlertDialogFooter>
            {canPromptCopy ? (
              <>
                <AlertDialogCancel
                  onClick={dismiss}
                  disabled={state === 'importing' || moving}
                >
                  {t('settings.postLoginMigration.dontCopy')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={isHere ? () => importData('append') : copyThere}
                  disabled={state === 'importing' || moving}
                >
                  {state === 'importing' ? '...' : copyLabel}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={dismiss}>
                {t('common.done')}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The copy failed.
          Both failing paths land here — the auto-import after a stored
          strategy, and Copy here in the question above. Before this dialog existed the
          first one set 'done' and said nothing, and the second one left an
          unhandled rejection with the prompt stuck on '...'.
          The question above opens only on 'prompting' || 'importing', so
          these two never show at once. */}
      <AlertDialog open={state === 'error'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.errorTitle')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {error?.role
              ? t('settings.postLoginMigration.errorRole')
              : error?.forbidden
                ? t('settings.postLoginMigration.errorForbidden')
                : t('settings.postLoginMigration.errorOther', {
                    message: error?.message ?? '',
                  })}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction onClick={dismiss}>
              {t('common.done')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
