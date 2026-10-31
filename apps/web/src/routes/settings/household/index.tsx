import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ExportCard } from '@/components/settings/ExportCard'
import { ImportCard } from '@/components/settings/ImportCard'
import { Toolbar } from '@/components/shared/Toolbar'

export const Route = createFileRoute('/settings/household/')({
  component: HouseholdConfig,
})

// The household config page. Until H3 the title is "My data" in both modes,
// because there is no household name yet. The danger zone arrives with the
// purges in H6.
function HouseholdConfig() {
  const { t } = useTranslation()

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <h1 className="px-3">{t('settings.household.title')}</h1>
        <span className="h-8" />
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px">
        <ExportCard />
        <ImportCard />
      </div>
    </div>
  )
}
