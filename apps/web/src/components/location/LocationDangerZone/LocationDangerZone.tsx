import { TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { usePermissions } from '@/hooks/usePermissions'
import { useRemoveAllLocationItems } from '@/hooks/usePurges'

/**
 * The danger zone of one location, on its people page (households H6, task
 * J.7, decision T55). Cloud only. **Remove all items** shows to an
 * ORGANIZER of this location only (`usePermissions().canRemoveAllItems`),
 * whatever the household role: a household owner or manager with no role
 * here does not see it, because the server asks the location role. Renders
 * nothing for anyone else.
 *
 * It deletes the location's stock rows and the rows of its carts. The
 * location, its carts, its people and roles, its logs and the catalog stay.
 * The confirm asks for the location name, typed EXACTLY as stored, through
 * `DeleteButton`'s `confirmName`. The hook reads every list again after the
 * write; it marks no lost location, because the location stays.
 */
export function LocationDangerZone({
  locationId,
  locationName,
}: {
  locationId: string
  /** As stored. The person types it to confirm. */
  locationName: string
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const { canRemoveAllItems } = usePermissions()
  const { removeAll, isPending } = useRemoveAllLocationItems(locationId)

  if (!canRemoveAllItems(locationId)) return null

  const label = t('settings.locations.danger.removeAll')
  const description = t('settings.locations.danger.removeAllDescription')

  return (
    <section aria-labelledby={titleId} className="space-y-2 px-4 py-2">
      <h2
        id={titleId}
        className="flex items-center gap-2 text-sm font-medium text-importance-destructive-foreground"
      >
        <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t('settings.locations.danger.title')}
      </h2>
      <p className="text-xs text-foreground-muted">{description}</p>
      <DeleteButton
        trigger={label}
        buttonVariant="destructive-outline"
        disabled={isPending}
        dialogTitle={label}
        dialogDescription={description}
        confirmLabel={label}
        confirmName={locationName}
        confirmNameLabel={t('settings.household.danger.typeName', {
          name: locationName,
        })}
        onDelete={async () => {
          await removeAll()
        }}
      />
    </section>
  )
}
