import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LocationList } from '@/components/location/LocationList'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import {
  useCreateLocation,
  useDeleteLocation,
  useLocations,
  useReorderLocations,
  useUpdateLocation,
} from '@/hooks/useLocations'
import type { Location } from '@/types'

export const Route = createFileRoute('/settings/locations/')({
  component: LocationSettingsPage,
})

export function LocationSettingsPage() {
  const { t } = useTranslation()
  const { goBack } = useAppNavigation('/settings')
  const { data: locations = [] } = useLocations()
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
      },
    )
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:mr-3"
            aria-label={t('common.goBack')}
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden lg:inline" aria-hidden="true">
              {t('common.goBack')}
            </span>
          </Button>
          <h1>{t('settings.locations.title')}</h1>
        </div>
        <Button
          size="icon"
          className="lg:w-auto lg:px-3"
          aria-label={t('settings.locations.addLabel')}
          onClick={() => setAddOpen(true)}
        >
          <Plus />
          <span className="hidden lg:inline">{t('common.add')}</span>
        </Button>
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px pb-4">
        {locations.length === 0 ? (
          <EmptyState
            title={t('settings.locations.emptyTitle')}
            description={t('settings.locations.emptyDescription')}
          />
        ) : (
          <LocationList
            locations={locations}
            onReorder={(orderedIds) => reorderLocations.mutate(orderedIds)}
            onRename={openRename}
            onDelete={(location) => deleteLocation.mutate(location.id)}
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
