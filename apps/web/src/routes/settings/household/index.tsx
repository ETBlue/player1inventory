import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ExportCard } from '@/components/settings/ExportCard'
import { HouseholdDangerZone } from '@/components/settings/HouseholdDangerZone'
import { HouseholdNameCard } from '@/components/settings/HouseholdNameCard'
import { ImportCard } from '@/components/settings/ImportCard'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'

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
  const { goBack } = useAppNavigation('/settings')
  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        {/* Mobile only, like the Back of the other household pages (Members,
            Locations, Tags…): it goes to the previous page, usually the
            /settings menu. On desktop the household sidebar has Back. Mobile
            settings pages have no bottom bar since 2026-11-23, so without it
            this page had no way out. */}
        <Button
          variant="neutral-ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t('common.goBack')}
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="lg:px-3 min-w-0 truncate">
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
