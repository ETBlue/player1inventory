import { createFileRoute } from '@tanstack/react-router'
import { CookingPot, Store, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataModeCard } from '@/components/settings/DataModeCard'
import { ExportCard } from '@/components/settings/ExportCard'
import { FamilyGroupCard } from '@/components/settings/FamilyGroupCard'
import { ImportCard } from '@/components/settings/ImportCard'
import { LanguageCard } from '@/components/settings/LanguageCard'
import { SettingsNavCard } from '@/components/settings/SettingsNavCard'
import { ThemeCard } from '@/components/settings/ThemeCard'
import { Toolbar } from '@/components/Toolbar'
import { useDataMode } from '@/hooks/useDataMode'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  const { mode } = useDataMode()
  const { t } = useTranslation()

  return (
    <div>
      <Toolbar>
        <h1 className="px-3">{t('settings.title')}</h1>
        <span className="h-8" />
      </Toolbar>

      <div className="space-y-px">
        <ThemeCard />
        <LanguageCard />
        <DataModeCard />
        {mode === 'cloud' && !import.meta.env.VITE_E2E_TEST_USER_ID && (
          <FamilyGroupCard />
        )}
        <ExportCard />
        <ImportCard />
        <SettingsNavCard
          icon={Tags}
          label={t('settings.tags.label')}
          description={t('settings.tags.description')}
          to="/settings/tags"
        />
        <SettingsNavCard
          icon={Store}
          label={t('settings.vendors.label')}
          description={t('settings.vendors.description')}
          to="/settings/vendors"
        />
        <SettingsNavCard
          icon={CookingPot}
          label={t('settings.recipes.label')}
          description={t('settings.recipes.description')}
          to="/settings/recipes"
        />
      </div>
    </div>
  )
}
