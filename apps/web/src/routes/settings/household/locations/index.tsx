import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { LocationList } from '@/components/location/LocationList'
import { LocationSortSelect } from '@/components/location/LocationSortSelect'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useDataMode } from '@/hooks/useDataMode'
import { useLocationSort } from '@/hooks/useLocationSort'
import {
  useCreateLocation,
  useDeleteLocation,
  useHouseholdLocations,
  useReorderLocations,
  useUpdateLocation,
} from '@/hooks/useLocations'
import { usePermissions } from '@/hooks/usePermissions'
import { hasGraphQLErrorCode } from '@/lib/graphqlErrorCode'
import { showSaveError } from '@/lib/saveError'
import type { Location } from '@/types'

export const Route = createFileRoute('/settings/household/locations/')({
  component: LocationSettingsPage,
})

export function LocationSettingsPage() {
  const { t } = useTranslation()
  const { goBack } = useAppNavigation('/settings')
  const { mode } = useDataMode()
  // Every location of the household for an owner or manager, "No access"
  // rows included, so a reorder sends the full list the server asks for
  // (households H5 tasks F.2 and F.3). Not `useLocations()`, the switcher's
  // list, which leaves out a location the caller has no role on.
  //
  // While the first load runs there is no list yet. The page shows a spinner,
  // not "No locations yet", so the empty state does not flash.
  const { data: unsorted = [], isLoading } = useHouseholdLocations()
  const {
    canManageLocations,
    canReorderLocations,
    isOrganizerAt,
    canOpenLocationPage,
  } = usePermissions()
  // The person's own sort (households H7b, decision T81). The same hook and
  // the same function sort the switcher (owner decision O53-A). Rows can be
  // dragged only with Custom: a drag in a list sorted by name would save an
  // order the person cannot see.
  const { sort, options, setSort, sorted } = useLocationSort()
  const locations = sorted(unsorted)
  const createLocation = useCreateLocation()
  const updateLocation = useUpdateLocation()
  const deleteLocation = useDeleteLocation()
  const reorderLocations = useReorderLocations()

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')

  // Rename dialog
  const [renameTarget, setRenameTarget] = useState<Location | null>(null)
  const [renameName, setRenameName] = useState('')

  const handleAdd = () => {
    if (!addName.trim()) return
    createLocation.mutate(addName.trim(), {
      onSuccess: () => {
        setAddName('')
        setAddOpen(false)
      },
      // The dialog stays open with the name. Before, nothing on screen said
      // the location was not created.
      onError: (err) => showSaveError(err),
    })
  }

  // A failed delete must say so: no role, a local Dexie error, or a network
  // error gets a general message rather than nothing. Until households H5 task
  // F.7 the server also refused a household's LAST location (`LAST_LOCATION`,
  // decision H13) and this page had its own text for it. F.7 lifted that rule,
  // so the last location can go, and a person with no location sees the empty
  // screen on Pantry, Shopping and Cooking (`NoLocationsGate`). An older
  // server that still answers `LAST_LOCATION` gets the general message.
  //
  // Offline is the exception. `offlineWriteLink` has already shown its own
  // "You are offline" toast before it rejects with `OfflineWriteError`, so a
  // second, general toast here would only repeat the same failure.
  const handleDelete = (location: Location) => {
    deleteLocation.mutate(location.id, {
      onError: (err: unknown) => {
        if (err instanceof OfflineWriteError) return
        toast.error(t('settings.locations.deleteError'))
      },
    })
  }

  // A refused reorder must say so, and the row then goes back to its place.
  // The server refuses a list that is not exactly the caller's own settings
  // list: `BAD_USER_INPUT` when a location was created or deleted, and since
  // households H7b `FORBIDDEN` when the list holds a location the caller no
  // longer has in it (a lost role, or a lower household role). Every
  // household role may reorder since H7b, so `FORBIDDEN` no longer means
  // "not allowed". Both get "the list changed", and `useReorderLocations`
  // reloads the lists. Any other failure (a network error) gets the general
  // message. Offline, `offlineWriteLink` has already shown its own toast
  // (see `handleDelete`).
  //
  // No message once the user has left the page: it would talk about a list
  // they no longer see. The reload still runs.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const handleReorder = (orderedIds: string[]) => {
    reorderLocations.mutate(orderedIds, {
      onError: (err: unknown) => {
        if (err instanceof OfflineWriteError || !mounted.current) return
        toast.error(
          hasGraphQLErrorCode(err, 'BAD_USER_INPUT') ||
            hasGraphQLErrorCode(err, 'FORBIDDEN')
            ? t('settings.locations.reorderError')
            : t('settings.locations.reorderFailed'),
        )
      },
    })
  }

  const openRename = (location: Location) => {
    setRenameTarget(location)
    setRenameName(location.name)
  }

  const handleRename = () => {
    if (!renameTarget || !renameName.trim()) return
    updateLocation.mutate(
      { id: renameTarget.id, updates: { name: renameName.trim() } },
      {
        onSuccess: () => {
          setRenameTarget(null)
          setRenameName('')
        },
        // The dialog stays open with the name. Before, nothing on screen
        // said the rename failed.
        onError: (err) => showSaveError(err),
      },
    )
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          {/* Mobile only: on desktop the household sidebar has Back (P1). */}
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t('common.goBack')}
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1>{t('settings.locations.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LocationSortSelect
            value={sort}
            options={options}
            onChange={setSort}
          />
          <Button
            size="icon"
            className="lg:w-auto lg:px-3"
            aria-label={t('settings.locations.addLabel')}
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            <span className="hidden lg:inline">{t('common.add')}</span>
          </Button>
        </div>
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px pb-4">
        {isLoading ? (
          <LoadingSpinner />
        ) : locations.length === 0 ? (
          <EmptyState
            title={t('settings.locations.emptyTitle')}
            description={t('settings.locations.emptyDescription')}
          />
        ) : (
          <LocationList
            locations={locations}
            onReorder={handleReorder}
            canManage={canManageLocations}
            canReorder={canReorderLocations && sort === 'custom'}
            canRename={(location) => isOrganizerAt(location.id)}
            showRoles={mode === 'cloud'}
            // The name links to the people page (households H5c, task H.6,
            // owner decision O24-A). `canOpenLocationPage` is `false` in
            // local mode, which has no people page.
            canOpen={(location) => canOpenLocationPage(location.id)}
            onRename={openRename}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Add location */}
      <AddNameDialog
        open={addOpen}
        title={t('settings.locations.addTitle')}
        submitLabel={t('common.add')}
        name={addName}
        placeholder={t('settings.locations.namePlaceholder')}
        isPending={createLocation.isPending}
        onNameChange={setAddName}
        onAdd={handleAdd}
        onClose={() => {
          setAddOpen(false)
          setAddName('')
        }}
      />

      {/* Rename location */}
      <AddNameDialog
        open={renameTarget !== null}
        title={t('settings.locations.renameTitle')}
        submitLabel={t('common.save')}
        name={renameName}
        placeholder={t('settings.locations.namePlaceholder')}
        isPending={updateLocation.isPending}
        onNameChange={setRenameName}
        onAdd={handleRename}
        onClose={() => {
          setRenameTarget(null)
          setRenameName('')
        }}
      />
    </div>
  )
}
