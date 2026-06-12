import { createFileRoute } from '@tanstack/react-router'
import { ChefHat, MapPin, ShelvingUnit, Store, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataModeCard } from '@/components/settings/DataModeCard'
import { ExportCard } from '@/components/settings/ExportCard'
import { ImportCard } from '@/components/settings/ImportCard'
import { LanguageCard } from '@/components/settings/LanguageCard'
import { SettingsNavCard } from '@/components/settings/SettingsNavCard'
import { ThemeCard } from '@/components/settings/ThemeCard'
import { Toolbar } from '@/components/shared/Toolbar'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  const { t } = useTranslation()

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <h1 className="px-3">{t('settings.title')}</h1>
        <span className="h-8" />
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px">
        <ThemeCard />
        <LanguageCard />
        <DataModeCard />
        <ExportCard />
        <ImportCard />
        <SettingsNavCard
          icon={MapPin}
          label={t('settings.locations.label')}
          description={t('settings.locations.description')}
          to="/settings/locations"
        />
        <SettingsNavCard
          icon={ShelvingUnit}
          label={t('settings.shelves.label')}
          description={t('settings.shelves.description')}
          to="/settings/shelves"
        />
        <SettingsNavCard
          icon={Store}
          label={t('settings.vendors.label')}
          description={t('settings.vendors.description')}
          to="/settings/vendors"
        />
        <SettingsNavCard
          icon={ChefHat}
          label={t('settings.recipes.label')}
          description={t('settings.recipes.description')}
          to="/settings/recipes"
        />
        <SettingsNavCard
          icon={Tags}
          label={t('settings.tags.label')}
          description={t('settings.tags.description')}
          to="/settings/tags"
        />
      </div>
    </div>
  )
}
