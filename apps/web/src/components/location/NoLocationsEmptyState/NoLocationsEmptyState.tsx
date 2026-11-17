import { MapPin, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface NoLocationsEmptyStateProps {
  /** Opens the Add Location dialog. `NoLocationsGate` owns the dialog. */
  onCreate: () => void
}

/**
 * What Pantry, Shopping and Cooking show in cloud mode when the person has no
 * location in the household (households H5 task F.7, Review Focus case 3).
 * That happens when the household's last location was deleted, or when a
 * member was added with no location role.
 *
 * Only the text and the button. `NoLocationsGate` decides when to show it and
 * owns the create dialog, so this stays a plain component for its story.
 */
export function NoLocationsEmptyState({
  onCreate,
}: NoLocationsEmptyStateProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <MapPin aria-hidden="true" className="size-8 text-foreground-muted" />
      <p className="text-foreground-muted">{t('noLocations.title')}</p>
      <Button onClick={onCreate}>
        <Plus />
        {t('noLocations.create')}
      </Button>
    </div>
  )
}
