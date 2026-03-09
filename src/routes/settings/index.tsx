import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ChevronRight,
  CookingPot,
  Globe,
  Moon,
  Store,
  Sun,
  Tags,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/hooks/useLanguage'
import { useTheme } from '@/hooks/useTheme'
import type { LanguagePreference } from '@/lib/language'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  const { preference, theme, setPreference } = useTheme()
  const {
    preference: langPreference,
    language,
    setPreference: setLangPreference,
  } = useLanguage()
  const { t } = useTranslation()

  return (
    <div>
      <Toolbar>
        <h1 className="px-3 py-2">Settings</h1>
      </Toolbar>

      <div className="space-y-px">
        {/* Theme Control Card */}
        <Card>
          <CardContent className="px-3 py-1">
            <div className="flex items-center gap-3 mb-3">
              {theme === 'dark' ? (
                <Moon className="h-5 w-5 text-foreground-muted" />
              ) : (
                <Sun className="h-5 w-5 text-foreground-muted" />
              )}
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-foreground-muted">
                  Choose light, dark, or system theme
                </p>
              </div>
            </div>

            <div className="flex">
              <Button
                variant={preference === 'light' ? 'neutral' : 'neutral-outline'}
                onClick={() => setPreference('light')}
                className="flex-1 rounded-tr-none rounded-br-none"
              >
                Light
              </Button>
              <Button
                variant={
                  preference === 'system' ? 'neutral' : 'neutral-outline'
                }
                onClick={() => setPreference('system')}
                className="flex-1 rounded-none -ml-px -mr-px"
              >
                System
              </Button>
              <Button
                variant={preference === 'dark' ? 'neutral' : 'neutral-outline'}
                onClick={() => setPreference('dark')}
                className="flex-1 rounded-tl-none rounded-bl-none"
              >
                Dark
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Language Control Card */}
        <Card>
          <CardContent className="px-3 py-1">
            <div className="flex items-center gap-3 mb-3">
              <Globe className="h-5 w-5 text-foreground-muted" />
              <div>
                <p className="font-medium">{t('settings.language.label')}</p>
                <p className="text-sm text-foreground-muted">
                  {langPreference === 'auto'
                    ? t('settings.language.autoDetected', {
                        language: t(`settings.language.languages.${language}`),
                      })
                    : t('settings.language.description')}
                </p>
              </div>
            </div>

            <Select
              value={langPreference}
              onValueChange={(val) =>
                setLangPreference(val as LanguagePreference)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {t('settings.language.auto')}
                </SelectItem>
                <SelectItem value="en">
                  {t('settings.language.languages.en')}
                </SelectItem>
                <SelectItem value="tw">
                  {t('settings.language.languages.tw')}
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Tags Card */}
        <Link to="/settings/tags" className="block">
          <Card>
            <CardContent className="px-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tags className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">Tags</p>
                  <p className="text-sm text-foreground-muted">
                    Manage tag types and tags
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground-muted" />
            </CardContent>
          </Card>
        </Link>

        {/* Vendors Card */}
        <Link to="/settings/vendors" className="block">
          <Card>
            <CardContent className="px-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Store className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">Vendors</p>
                  <p className="text-sm text-foreground-muted">
                    Manage vendors
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground-muted" />
            </CardContent>
          </Card>
        </Link>

        {/* Recipes Card */}
        <Link to="/settings/recipes" className="block">
          <Card>
            <CardContent className="px-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CookingPot className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">Recipes</p>
                  <p className="text-sm text-foreground-muted">
                    Manage recipes
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground-muted" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
