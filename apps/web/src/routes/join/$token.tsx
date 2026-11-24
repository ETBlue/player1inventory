import { createFileRoute, Link } from '@tanstack/react-router'
import { Home, MapPin } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { switchToHousehold } from '@/apollo/householdGuard'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  type InvitePreviewQuery,
  useInvitePreviewQuery,
  useJoinHouseholdMutation,
} from '@/generated/graphql'
import { useDataMode } from '@/hooks/useDataMode'
import { skipCopyPromptIn } from '@/hooks/usePostLoginMigration'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
import { hasGraphQLErrorReason } from '@/lib/graphqlErrorCode'

// The join page of an invite link (households H5b, task G.7).
//
// Three things could send a brand-new person away from this page before
// they can press Join (Review Focus 1). Each is handled elsewhere:
// - the onboarding redirect: `shouldRedirectToOnboarding` skips `/join/`
//   (decision T25);
// - the sign-in page: `CloudAuthGuard` passes this path as `redirect`, and
//   `/sign-in` returns here after sign-in AND sign-up (decision T24);
// - local mode, the default for a new visitor: this page explains and
//   offers "Sign in to join" (owner decision O12-A).
//
// Full-screen (`isFullscreenPage`), so no sidebar or bottom bar shows.
export const Route = createFileRoute('/join/$token')({
  component: JoinRoute,
})

function JoinRoute() {
  const { token } = Route.useParams()
  const { mode } = useDataMode()
  return (
    <div className="flex min-h-[100cqh] items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        {mode === 'cloud' ? <CloudJoin token={token} /> : <LocalJoin />}
      </div>
    </div>
  )
}

/**
 * Local mode: households need cloud sync. "Sign in to join" switches to
 * cloud and reloads; `CloudAuthGuard` then sends the person to sign-in with
 * this page as the return path.
 *
 * It must NOT copy the local data (the `join.needsCloud` text promises
 * that), and must not touch it:
 * - `migration-strategy` stays unset, so no copy starts after sign-in;
 * - `PostLoginMigrationDialog` does not ask to copy on the sign-in page or
 *   on this page (`isCopyPromptPausedPath`), and never in the household
 *   joined: Join adds it to `migration-skip-households` (`CloudJoin`).
 *
 * It does NOT set `migration-prompted`. It did until 2026-11-19, and that
 * key turns the question off on this device for every household, also one
 * the person creates later as its owner
 * (docs/global/bugs/2026-11-19-bug-join-turns-off-copy-prompt.md).
 */
function LocalJoin() {
  const { t } = useTranslation()

  function handleSignIn() {
    localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
    window.location.reload()
  }

  return (
    <>
      <PageHeading>{t('join.heading')}</PageHeading>
      <p>{t('join.needsCloud')}</p>
      <Button onClick={handleSignIn}>{t('join.signIn')}</Button>
    </>
  )
}

function PageHeading({ children }: { children: ReactNode }) {
  return <h1 className="text-xl font-semibold">{children}</h1>
}

type Preview = InvitePreviewQuery['invitePreview']
type Refusal = 'INVALID' | 'ALREADY_MEMBER'

function CloudJoin({ token }: { token: string }) {
  const { t } = useTranslation()
  // `network-only`: an invite can be used, revoked or expire at any time,
  // so a cached answer is not worth showing.
  const preview = useInvitePreviewQuery({
    variables: { token },
    fetchPolicy: 'network-only',
  })
  const [join] = useJoinHouseholdMutation()
  // A refusal of the join itself. It wins over the preview: the link may
  // have been used, or the person may have joined in another tab, after the
  // preview was read.
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [busy, setBusy] = useState(false)
  // When a refusal replaces the Join button, the focused button is gone and
  // focus would fall to the page body. Move it to the message instead, so a
  // screen reader reads it. The message is an `<output>`, whose role is
  // `status`, so it is announced as well.
  const messageRef = useRef<HTMLOutputElement>(null)
  useEffect(() => {
    if (refusal) messageRef.current?.focus()
  }, [refusal])

  const data = preview.data?.invitePreview
  if (!data) {
    return (
      <>
        <PageHeading>{t('join.heading')}</PageHeading>
        {preview.error ? (
          <output className="block">{t('join.loadError')}</output>
        ) : (
          <LoadingSpinner />
        )}
      </>
    )
  }

  const status = refusal ?? data.status

  async function handleJoin() {
    setBusy(true)
    let householdId: string
    try {
      const result = await join({ variables: { token } })
      const joined = result.data?.joinHousehold
      if (!joined) throw new Error('joinHousehold returned no household')
      householdId = joined.id
    } catch (err) {
      setBusy(false)
      if (hasGraphQLErrorReason(err, 'INVITE_INVALID')) setRefusal('INVALID')
      else if (hasGraphQLErrorReason(err, 'ALREADY_MEMBER'))
        setRefusal('ALREADY_MEMBER')
      // Offline, `offlineWriteLink` has already shown its own toast.
      else if (!(err instanceof OfflineWriteError)) toast.error(t('join.error'))
      return
    }
    // The join is done. Never offer to copy local data into the household
    // joined (owner decision O12-A). Only this household: the question may
    // still come in another one, for example the person's own. Written
    // before the switch, which reloads; every tab reads the same storage.
    skipCopyPromptIn(householdId)
    // The server now answers for the joined household, so
    // clear the old household's cache (decision T23) and go to the pantry.
    // NOT a reload of this page: the invite is used now, so `invitePreview`
    // would answer INVALID and the person would read "This invite is no
    // longer valid" right after joining. Keep the button disabled: the page
    // is about to change.
    try {
      await switchToHousehold(householdId, { to: '/' })
    } catch (err) {
      // The cache could not be cleared. Go to the pantry anyway: the stored
      // household id is still the old one, so `HouseholdChangeGuard` tries
      // again on the next load.
      console.error('Could not clear the data of the old household', err)
      window.location.replace('/')
    }
  }

  if (status === 'INVALID') {
    // Show no name here. The server sends none for INVALID, and a link that
    // is no longer valid should say nothing about a household.
    return (
      <>
        <PageHeading>{t('join.heading')}</PageHeading>
        <output ref={messageRef} tabIndex={-1} className="block">
          {t('join.invalid')}
        </output>
        <PantryLink />
      </>
    )
  }

  if (status === 'ALREADY_MEMBER') {
    return (
      <>
        <PageHeading>{data.householdName ?? t('join.heading')}</PageHeading>
        <output ref={messageRef} tabIndex={-1} className="block">
          {t('join.alreadyMember')}
        </output>
        <PantryLink />
      </>
    )
  }

  return (
    <>
      <PageHeading>
        {t('join.title', { household: data.householdName ?? '' })}
      </PageHeading>
      {data.invitedByName && (
        <p>{t('join.invitedBy', { name: data.invitedByName })}</p>
      )}
      <RoleList preview={data} />
      <Button onClick={handleJoin} disabled={busy}>
        {t('join.join')}
      </Button>
    </>
  )
}

/**
 * The roles the invite gives. First the household row, then, under a
 * title, one row per location of that household. Each row is a card with an
 * icon, the name, and "Your role: …". The title is an `h2` that names the
 * list, so a screen reader announces "Locations in this household, list". Household and location names
 * render as stored (no `capitalize`, root `CLAUDE.md`, *Name Display
 * Convention*).
 */
function RoleList({ preview }: { preview: Preview }) {
  const { t } = useTranslation()
  const locations = preview.locationRoles ?? []
  const locationsTitleId = useId()
  return (
    <section className="flex w-full flex-col gap-3 text-left">
      {preview.householdRole && (
        <RoleRow
          icon={<Home className="size-4" aria-hidden="true" />}
          name={preview.householdName ?? ''}
          role={t(`roles.household.${preview.householdRole}`)}
        />
      )}
      {locations.length > 0 && (
        <>
          <h2 id={locationsTitleId} className="pt-2 text-center">
            {t('join.locationsTitle')}
          </h2>
          <ul
            aria-labelledby={locationsTitleId}
            className="flex flex-col gap-3"
          >
            {locations.map((row) => (
              <li key={row.locationId}>
                <RoleRow
                  icon={<MapPin className="size-4" aria-hidden="true" />}
                  name={row.locationName}
                  role={t(`roles.location.${row.role}`)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function RoleRow({
  icon,
  name,
  role,
}: {
  icon: ReactNode
  name: string
  role: string
}) {
  const { t } = useTranslation()
  return (
    <Card className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-foreground-muted">{icon}</span>
      <span className="min-w-0 flex-1 break-words">{name}</span>
      <span className="shrink-0 text-sm">
        <span className="text-foreground-muted">{t('join.yourRole')}</span>{' '}
        {role}
      </span>
    </Card>
  )
}

function PantryLink() {
  const { t } = useTranslation()
  return (
    <Link to="/" className="underline">
      {t('navigation.pantry')}
    </Link>
  )
}
