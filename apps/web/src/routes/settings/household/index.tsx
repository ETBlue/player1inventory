import { createFileRoute } from '@tanstack/react-router'
import { ExportCard } from '@/components/settings/ExportCard'
import { HouseholdLabel } from '@/components/settings/HouseholdLabel'
import { HouseholdNameCard } from '@/components/settings/HouseholdNameCard'
import { ImportCard } from '@/components/settings/ImportCard'
import { Toolbar } from '@/components/shared/Toolbar'

export const Route = createFileRoute('/settings/household/')({
  component: HouseholdConfig,
})

// The household config page. The title is the household's name in cloud mode
// and "My data" in local mode (households H3a task 3.13). The name card shows
// in cloud mode only: the owner can rename the household there. The danger
// zone arrives with the purges in H6.
function HouseholdConfig() {
  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <h1 className="px-3 min-w-0 truncate">
          <HouseholdLabel />
        </h1>
        <span className="h-8" />
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px">
        <HouseholdNameCard />
        <ExportCard />
        <ImportCard />
      </div>
    </div>
  )
}
