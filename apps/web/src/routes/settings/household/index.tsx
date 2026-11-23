import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ExportCard } from '@/components/settings/ExportCard'
import { HouseholdDangerZone } from '@/components/settings/HouseholdDangerZone'
import { HouseholdNameCard } from '@/components/settings/HouseholdNameCard'
import { ImportCard } from '@/components/settings/ImportCard'
import { Toolbar } from '@/components/shared/Toolbar'

export const Route = createFileRoute('/settings/household/')({
  component: HouseholdConfig,
})

// The household config page. The title is "General", in both modes: the same
// label as this page's link in the household sidebar and the mobile accordion,
// the way the other household pages title themselves (Members, Tags, …). Until
// 2026-11-23 the title was `HouseholdLabel` (the household's name in cloud
// mode, "My data" in local mode). On desktop the sidebar heading next to Back
// still shows that label. The name card shows in cloud mode only: the owner
// can rename the household there. The danger zone (households H6, task J.7)
// shows to the cloud owner only, last.
function HouseholdConfig() {
  const { t } = useTranslation()
  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <h1 className="px-3 min-w-0 truncate">
          {t('settings.household.general.label')}
        </h1>
        <span className="h-8" />
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px">
        <HouseholdNameCard />
        <ExportCard />
        <ImportCard />
        <HouseholdDangerZone />
      </div>
    </div>
  )
}
