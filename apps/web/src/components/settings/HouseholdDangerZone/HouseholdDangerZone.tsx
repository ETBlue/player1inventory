import { TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useHousehold } from '@/hooks/useHousehold'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useClearHousehold,
  useDeleteAllLocations,
  useDeleteHousehold,
} from '@/hooks/usePurges'

/**
 * The household danger zone on `/settings/household` (households H6, task
 * J.7; decisions T52 and T55; owner decisions O34-A and O38-A). Cloud only,
 * household OWNER only (`usePermissions().canPurgeHousehold`). Renders
 * nothing for anyone else, and nothing in local mode.
 *
 * | Button | Hook | What it deletes | What stays |
 * |---|---|---|---|
 * | Clear household | `useClearHousehold` | the catalog and every location | the people and their household roles; a new "Home" is made |
 * | Delete all locations | `useDeleteAllLocations` | every location with its stock, carts, logs and roles | the catalog; NO new location (O34-A) |
 * | Delete household | `useDeleteHousehold` | the household and everything in it | nothing; everyone loses access (O38-A) |
 *
 * Each confirm asks for the household name, typed EXACTLY as stored (case
 * and spaces), through `DeleteButton`'s `confirmName`. The hooks do the
 * rest: the lost-access mark (`expectLocationLoss`), the reads after the
 * write, and, after Delete household, clearing the cache and moving the
 * device. So this component never navigates or clears anything itself.
 * While one purge runs, every button is off.
 */
export function HouseholdDangerZone() {
  const { t } = useTranslation()
  const titleId = useId()
  const { canPurgeHousehold } = usePermissions()
  const { data } = useHousehold()
  const { clear, isPending: clearing } = useClearHousehold()
  const { deleteAll, isPending: deletingAll } = useDeleteAllLocations()
  const { deleteHousehold, isPending: deletingHousehold } = useDeleteHousehold()

  if (!canPurgeHousehold || !data) return null

  const name = data.name
  const running = clearing || deletingAll || deletingHousehold
  const purges = [
    {
      key: 'clear',
      label: t('settings.household.danger.clear'),
      description: t('settings.household.danger.clearDescription'),
      run: async () => {
        await clear()
      },
    },
    {
      key: 'deleteLocations',
      label: t('settings.household.danger.deleteLocations'),
      description: t('settings.household.danger.deleteLocationsDescription'),
      run: async () => {
        await deleteAll()
      },
    },
    {
      key: 'deleteHousehold',
      label: t('settings.household.danger.deleteHousehold'),
      description: t('settings.household.danger.deleteHouseholdDescription'),
      run: () => deleteHousehold(),
    },
  ]

  return (
    <Card className="space-y-2 px-4">
      <section aria-labelledby={titleId}>
        <CardHeader className="flex items-center gap-4">
          <TriangleAlert
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-importance-destructive-foreground"
          />
          <CardTitle id={titleId}>
            {t('settings.household.danger.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="ml-9 block space-y-4">
          {purges.map((purge) => (
            <div key={purge.key} className="space-y-2">
              <CardDescription>{purge.description}</CardDescription>
              <DeleteButton
                trigger={purge.label}
                buttonVariant="destructive-outline"
                disabled={running}
                dialogTitle={purge.label}
                dialogDescription={purge.description}
                confirmLabel={purge.label}
                confirmName={name}
                confirmNameLabel={t('settings.household.danger.typeName', {
                  name,
                })}
                onDelete={purge.run}
              />
            </div>
          ))}
        </CardContent>
      </section>
    </Card>
  )
}
