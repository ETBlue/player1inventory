import { createFileRoute, Navigate } from '@tanstack/react-router'
import {
  ChefHat,
  Home,
  MapPin,
  ShelvingUnit,
  SlidersHorizontal,
  Store,
  Tags,
  User,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataModeCard } from '@/components/settings/DataModeCard'
import { LanguageCard } from '@/components/settings/LanguageCard'
import { SettingsNavCard } from '@/components/settings/SettingsNavCard'
import { ThemeCard } from '@/components/settings/ThemeCard'
import { Toolbar } from '@/components/shared/Toolbar'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useIsDesktop } from '@/hooks/useIsDesktop'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

// On desktop the household sidebar holds the settings menu, so /settings
// goes straight to the household config page. On mobile there is no
// sidebar, so /settings is a two-item accordion instead.
function Settings() {
  const isDesktop = useIsDesktop()
  if (isDesktop) return <Navigate to="/settings/household" replace />
  return <SettingsAccordion />
}

function SettingsAccordion() {
  const { t } = useTranslation()

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <h1 className="px-3">{t('settings.title')}</h1>
        <span className="h-8" />
      </Toolbar>

      <div className="overflow-y-auto [container-type:size]">
        <Accordion type="multiple" defaultValue={['household']}>
          <AccordionItem value="household">
            <AccordionTrigger className="px-4">
              <span className="flex items-center gap-4">
                <Home className="h-5 w-5 text-foreground-muted shrink-0" />
                {t('settings.household.title')}
              </span>
            </AccordionTrigger>
            <AccordionContent className="p-0 space-y-px">
              <SettingsNavCard
                icon={SlidersHorizontal}
                label={t('settings.household.general.label')}
                description={t('settings.household.general.description')}
                to="/settings/household"
              />
              <SettingsNavCard
                icon={MapPin}
                label={t('settings.locations.label')}
                description={t('settings.locations.description')}
                to="/settings/household/locations"
              />
              <SettingsNavCard
                icon={ShelvingUnit}
                label={t('settings.shelves.label')}
                description={t('settings.shelves.description')}
                to="/settings/household/shelves"
              />
              <SettingsNavCard
                icon={Store}
                label={t('settings.vendors.label')}
                description={t('settings.vendors.description')}
                to="/settings/household/vendors"
              />
              <SettingsNavCard
                icon={ChefHat}
                label={t('settings.recipes.label')}
                description={t('settings.recipes.description')}
                to="/settings/household/recipes"
              />
              <SettingsNavCard
                icon={Tags}
                label={t('settings.tags.label')}
                description={t('settings.tags.description')}
                to="/settings/household/tags"
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="user">
            <AccordionTrigger className="px-4">
              <span className="flex items-center gap-4">
                <User className="h-5 w-5 text-foreground-muted shrink-0" />
                {/* "Preferences" in both modes for now. Task 1.7 shows the
                    user's name here in cloud mode. */}
                {t('settings.user.title')}
              </span>
            </AccordionTrigger>
            {/* Task 1.7 replaces these three cards with the panel the user
                sidebar shares. */}
            <AccordionContent className="p-0 space-y-px">
              <ThemeCard />
              <LanguageCard />
              <DataModeCard />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
