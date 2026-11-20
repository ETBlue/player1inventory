import {
  createFileRoute,
  Link,
  Navigate,
  useNavigate,
} from '@tanstack/react-router'
import { ArrowLeft, Info, LogOut, Pencil, UserPlus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddLocationPersonDialog } from '@/components/location/AddLocationPersonDialog'
import { LocationDangerZone } from '@/components/location/LocationDangerZone'
import {
  LocationPeopleList,
  type LocationPersonRow,
} from '@/components/location/LocationPeopleList'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import type { LocationRole } from '@/generated/graphql'
import { useDataMode } from '@/hooks/useDataMode'
import { useHouseholdMembers } from '@/hooks/useHouseholdMembers'
import {
  useLeaveLocation,
  useLocationPeople,
  useRemoveLocationRole,
  useSetLocationRole,
} from '@/hooks/useLocationPeople'
import { useHouseholdLocations, useUpdateLocation } from '@/hooks/useLocations'
import { usePermissions } from '@/hooks/usePermissions'
import { showSaveError } from '@/lib/saveError'

// The people page of one location (households H5c, task H.5). Cloud only.
//
// | Who | Sees |
// |---|---|
// | household owner or manager | every location's page, also with No access (owner decision O24-A); a role picker with every role and Remove on every other row; Add person; the No organizer action sentence |
// | location organizer (household member) | the people; a picker with participant and viewer on participant and viewer rows, and Remove there; nothing on an organizer's row, their own included; Add person (participant or viewer); Rename |
// | location participant or viewer | the people and roles, and Leave location (O24-A). No other control |
// | location organizer, any household role | also the danger zone with Remove all items (households H6, task J.7). A household owner or manager with no role here does not get it |
// | anyone else | "You do not have access to this location." (decision T41) |
//
// The rights come from `usePermissions()` (`canChangeRole`, the shared rule of
// decision T33). The server checks every write; this page only hides what it
// would refuse. The page reads no stock, cart or log of the location
// (Review Focus 4): only `LocationPeople`, `GetHouseholdLocations` (the name
// and `hasOrganizer`) and `HouseholdMembers` (for Add person).
export const Route = createFileRoute('/settings/household/locations/$id')({
  component: LocationPeopleRoute,
})

const ROLES: readonly LocationRole[] = ['organizer', 'participant', 'viewer']

/**
 * Local mode has one person and no roles (decision T41). A person who opens
 * the URL anyway goes to the locations list.
 */
function LocationPeopleRoute() {
  const { mode } = useDataMode()
  const { id } = Route.useParams()
  if (mode !== 'cloud')
    return <Navigate to="/settings/household/locations" replace />
  return <LocationPeoplePage locationId={id} />
}

export function LocationPeoplePage({ locationId }: { locationId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { canManageLocations, isOrganizerAt, roleAt, canChangeRole } =
    usePermissions()
  const locations = useHouseholdLocations()
  const location = locations.data?.find((l) => l.id === locationId)
  const people = useLocationPeople(locationId)
  const { setRole } = useSetLocationRole()
  const { remove } = useRemoveLocationRole()
  const { leave } = useLeaveLocation()
  const updateLocation = useUpdateLocation()

  // A remove or a leave is running. The confirm closes at once, so without
  // these the same button could be confirmed again (the H5b G.9 finding).
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [leaving, setLeaving] = useState(false)
  // A role change is running, per person: the picker shows the picked role
  // and is off until the change and its reads are done. Without it the
  // picker jumped back to the old role until the list was read again, and a
  // second, different pick could be sent meanwhile.
  const [pendingRoles, setPendingRoles] = useState<
    ReadonlyMap<string, LocationRole>
  >(() => new Map())
  const [renameName, setRenameName] = useState<string | null>(null)
  const peopleHeadingRef = useRef<HTMLHeadingElement>(null)

  const errorText = t('settings.locations.people.error')
  // A member with no role here, an unknown id or a failed list read has no
  // name for the location; the heading must still say something.
  const name = location?.name ?? t('settings.locations.people.unnamed')
  const canChange = (from: LocationRole | null, to: LocationRole | null) =>
    canChangeRole(locationId, from, to)
  // The roles the caller may GIVE to a person with no role here.
  const givableRoles = ROLES.filter((r) => canChange(null, r))

  const handleSetRole = (person: LocationPersonRow, role: LocationRole) => {
    if (pendingRoles.has(person.userId)) return
    setPendingRoles((prev) => new Map(prev).set(person.userId, role))
    setRole(locationId, person.userId, role)
      .catch((err) => showSaveError(err, errorText))
      .finally(() =>
        setPendingRoles((prev) => {
          const next = new Map(prev)
          next.delete(person.userId)
          return next
        }),
      )
  }

  // `false` from the server means the person had no role here any more (a
  // second press, or another tab was first, decision T38). That is not an
  // error, so nothing is shown; the list is read again either way.
  const handleRemove = async (person: LocationPersonRow) => {
    if (removingIds.has(person.userId)) return
    setRemovingIds((prev) => new Set(prev).add(person.userId))
    try {
      await remove(locationId, person.userId)
      // The row, and the button that had focus, are gone.
      peopleHeadingRef.current?.focus()
    } catch (err) {
      showSaveError(err, errorText)
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(person.userId)
        return next
      })
    }
  }

  // After a leave an owner or manager can still open the page, so they stay.
  // Anyone else can no longer read it and goes to the list.
  const handleLeave = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await leave(locationId)
      if (canManageLocations) {
        setLeaving(false)
        // The Leave button, which had focus, is gone.
        peopleHeadingRef.current?.focus()
      } else {
        await navigate({ to: '/settings/household/locations' })
      }
    } catch (err) {
      setLeaving(false)
      showSaveError(err, errorText)
    }
  }

  const handleRename = () => {
    if (renameName === null || !renameName.trim()) return
    updateLocation.mutate(
      { id: locationId, updates: { name: renameName.trim() } },
      {
        onSuccess: () => setRenameName(null),
        // The dialog stays open with the name.
        onError: (err) => showSaveError(err),
      },
    )
  }

  const rows = people.data ?? []
  const me = rows.find((p) => p.isMe)
  const onlyOrganizer =
    me?.role === 'organizer' &&
    rows.filter((p) => p.role === 'organizer').length === 1

  let body: React.ReactNode
  // The CODE, not `isError`: after a leave Apollo keeps the old rows next to
  // the FORBIDDEN, so `isError` stays false (`useLocationPeople`).
  if (people.errorCode === 'FORBIDDEN') {
    body = (
      <p className="px-4 py-4">{t('settings.locations.people.noAccess')}</p>
    )
  } else if (people.isLoading || (locations.isLoading && !location)) {
    body = <LoadingSpinner />
  } else if (people.isError) {
    body = (
      <div className="flex flex-wrap items-center gap-2 px-4 py-4">
        <output>{t('settings.locations.people.loadError')}</output>
        <Button variant="neutral-outline" onClick={people.refetch}>
          {t('settings.locations.people.retry')}
        </Button>
      </div>
    )
  } else {
    body = (
      <>
        {location?.hasOrganizer === false && (
          <div className="flex items-start gap-2 px-4 py-2 text-sm text-foreground-muted">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {t('settings.locations.noOrganizer')}
              </p>
              <p>{t('settings.locations.people.noOrganizerNote')}</p>
              {canManageLocations && (
                <p>{t('settings.locations.people.noOrganizerAction')}</p>
              )}
            </div>
          </div>
        )}

        <section className="space-y-px">
          <div className="px-4 py-2">
            <h2
              ref={peopleHeadingRef}
              tabIndex={-1}
              className="text-sm font-medium text-foreground-muted outline-none"
            >
              {t('settings.locations.people.title')}
            </h2>
            <p className="text-xs text-foreground-muted">
              {t('settings.locations.people.description')}
            </p>
          </div>
          <LocationPeopleList
            people={rows}
            locationName={name}
            canChange={canChange}
            onSetRole={handleSetRole}
            onRemove={handleRemove}
            removingUserIds={removingIds}
            pendingRoles={pendingRoles}
          />
        </section>

        {givableRoles.length > 0 && (
          <AddPersonSection
            locationId={locationId}
            people={rows}
            roles={givableRoles}
            onAdd={setRole}
            errorText={errorText}
          />
        )}

        {roleAt(locationId) !== null && (
          <div className="px-4 py-2">
            {leaving ? (
              <output className="text-sm text-foreground-muted">
                {t('settings.locations.people.leaving')}
              </output>
            ) : (
              <DeleteButton
                trigger={
                  <>
                    <LogOut />
                    {t('settings.locations.people.leave')}
                  </>
                }
                buttonVariant="destructive-outline"
                dialogTitle={t('settings.locations.people.leave')}
                dialogDescription={
                  onlyOrganizer
                    ? `${t('settings.locations.people.leaveConfirm', {
                        location: name,
                      })} ${t('settings.locations.people.leaveOnlyOrganizer')}`
                    : t('settings.locations.people.leaveConfirm', {
                        location: name,
                      })
                }
                confirmLabel={t('settings.locations.people.leave')}
                onDelete={handleLeave}
              />
            )}
          </div>
        )}

        {/* Only with the stored name: the person types it to confirm. */}
        {location && (
          <LocationDangerZone
            locationId={locationId}
            locationName={location.name}
          />
        )}
      </>
    )
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar className="justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            asChild
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:px-3"
          >
            <Link
              to="/settings/household/locations"
              aria-label={t('settings.locations.people.back')}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden lg:inline">
                {t('settings.locations.people.back')}
              </span>
            </Link>
          </Button>
          {/* As stored: no `capitalize` (Name Display Convention). */}
          <h1 className="truncate">{name}</h1>
        </div>
        {location && isOrganizerAt(locationId) && (
          <Button
            variant="neutral-ghost"
            size="icon"
            aria-label={t('settings.locations.renameLabel', { name })}
            onClick={() => setRenameName(name)}
          >
            <Pencil />
          </Button>
        )}
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-4 pb-4">
        {body}
      </div>

      <AddNameDialog
        open={renameName !== null}
        title={t('settings.locations.renameTitle')}
        submitLabel={t('common.save')}
        name={renameName ?? ''}
        placeholder={t('settings.locations.namePlaceholder')}
        isPending={updateLocation.isPending}
        onNameChange={setRenameName}
        onAdd={handleRename}
        onClose={() => setRenameName(null)}
      />
    </div>
  )
}

/**
 * Add person, for a caller who may give at least one role. It reads the
 * household's members only here, so a participant or viewer never asks for
 * them. The choices are the members with no role on this location
 * (decision T43), in the members list's order.
 */
function AddPersonSection({
  locationId,
  people,
  roles,
  onAdd,
  errorText,
}: {
  locationId: string
  people: LocationPersonRow[]
  roles: LocationRole[]
  onAdd: (
    locationId: string,
    userId: string,
    role: LocationRole,
  ) => Promise<unknown>
  errorText: string
}) {
  const { t } = useTranslation()
  const members = useHouseholdMembers()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  if (members.isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <output className="text-sm">
          {t('settings.locations.people.membersLoadError')}
        </output>
        <Button variant="neutral-outline" onClick={members.refetch}>
          {t('settings.locations.people.retry')}
        </Button>
      </div>
    )
  }
  if (!members.data) return null
  const listed = new Set(people.map((p) => p.userId))
  const candidates = members.data
    .filter((m) => !listed.has(m.userId))
    .map((m) => ({ userId: m.userId, displayName: m.displayName }))

  const handleAdd = async (userId: string, role: LocationRole) => {
    setAdding(true)
    try {
      await onAdd(locationId, userId, role)
      setOpen(false)
    } catch (err) {
      showSaveError(err, errorText)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="px-4 py-2">
      {candidates.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          {t('settings.locations.people.noOneToAdd')}
        </p>
      ) : (
        <Button variant="neutral-outline" onClick={() => setOpen(true)}>
          <UserPlus />
          {t('settings.locations.people.add')}
        </Button>
      )}
      {open && (
        <AddLocationPersonDialog
          candidates={candidates}
          roles={roles}
          isPending={adding}
          onAdd={handleAdd}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
