import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NoLocationsEmptyState } from '@/components/location/NoLocationsEmptyState'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { useDataMode } from '@/hooks/useDataMode'
import { useCreateLocation, useLocations } from '@/hooks/useLocations'
import { showSaveError } from '@/lib/saveError'

/**
 * Shows `NoLocationsEmptyState` instead of the page when the person has no
 * location (households H5 task F.7, Review Focus case 3). Wraps the Pantry,
 * Shopping, cart and Cooking routes.
 *
 * Cloud mode only. Local mode always has its default location, which cannot
 * be deleted, so its list is never empty.
 *
 * "No locations" means the list has LOADED and is empty. While it loads, or
 * when the read failed with nothing cached, `data` is `undefined` and the page
 * renders as before. Without this gate every location-scoped read waits for
 * `useCloudLocationKnown`, which never comes, so the page showed a spinner
 * forever.
 *
 * The page is a CHILD here, so none of its hooks run while the empty screen
 * shows: nothing reads stock or carts for a location that does not exist.
 *
 * Create a location opens the same Add Location dialog as the settings page.
 * Once the new location is in the list, the gate renders the page, and
 * `ActiveLocationProvider` picks the first location as the active one.
 */
export function NoLocationsGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { mode } = useDataMode()
  const { data: locations } = useLocations()
  const createLocation = useCreateLocation()
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')

  const hasNoLocations =
    mode === 'cloud' && locations !== undefined && locations.length === 0
  if (!hasNoLocations) return <>{children}</>

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

  return (
    <div className="h-[100cqh] overflow-y-auto">
      <NoLocationsEmptyState onCreate={() => setAddOpen(true)} />
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
    </div>
  )
}
