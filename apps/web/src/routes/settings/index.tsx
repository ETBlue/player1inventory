import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ChevronRight,
  CookingPot,
  Database,
  Globe,
  Moon,
  Store,
  Sun,
  Tags,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/Toolbar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDataMode } from '@/hooks/useDataMode'
import { useLanguage } from '@/hooks/useLanguage'
import { useTheme } from '@/hooks/useTheme'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
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
  const { mode } = useDataMode()
  const [showEnableConfirm, setShowEnableConfirm] = useState(false)

  function handleEnableSharing() {
    setShowEnableConfirm(true)
  }

  function confirmEnableSharing() {
    localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
    window.location.reload()
  }

  return (
    <div>
      <Toolbar>
        <h1 className="px-3 py-2">{t('settings.title')}</h1>
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
                <p className="font-medium">{t('settings.theme.label')}</p>
                <p className="text-sm text-foreground-muted">
                  {t('settings.theme.description')}
                </p>
              </div>
            </div>

            <div className="flex">
              <Button
                variant={preference === 'light' ? 'neutral' : 'neutral-outline'}
                onClick={() => setPreference('light')}
                className="flex-1 rounded-tr-none rounded-br-none"
              >
                {t('settings.theme.light')}
              </Button>
              <Button
                variant={
                  preference === 'system' ? 'neutral' : 'neutral-outline'
                }
                onClick={() => setPreference('system')}
                className="flex-1 rounded-none -ml-px -mr-px"
              >
                {t('settings.theme.system')}
              </Button>
              <Button
                variant={preference === 'dark' ? 'neutral' : 'neutral-outline'}
                onClick={() => setPreference('dark')}
                className="flex-1 rounded-tl-none rounded-bl-none"
              >
                {t('settings.theme.dark')}
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

        {/* Data Mode Card */}
        <Card>
          <CardContent className="px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">
                    {mode === 'local' ? 'Login-free mode' : 'Sharing enabled'}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {mode === 'local'
                      ? 'Data stored on this device only'
                      : 'Data synced to the cloud'}
                  </p>
                </div>
              </div>
              {mode === 'local' && (
                <Button variant="neutral-outline" onClick={handleEnableSharing}>
                  Enable sharing →
                </Button>
              )}
              {mode === 'cloud' && (
                <Button variant="neutral-outline" onClick={() => {}}>
                  Disable sharing
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Enable Sharing Confirm Dialog */}
        <AlertDialog
          open={showEnableConfirm}
          onOpenChange={setShowEnableConfirm}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enable sharing?</AlertDialogTitle>
              <AlertDialogDescription>
                Sharing requires signing in. Once enabled, your data will be
                stored in the cloud and a login will be required each session.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmEnableSharing}>
                Enable
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Tags Card */}
        <Link to="/settings/tags" className="block">
          <Card>
            <CardContent className="px-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tags className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">{t('settings.tags.label')}</p>
                  <p className="text-sm text-foreground-muted">
                    {t('settings.tags.description')}
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
                  <p className="font-medium">{t('settings.vendors.label')}</p>
                  <p className="text-sm text-foreground-muted">
                    {t('settings.vendors.description')}
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
                  <p className="font-medium">{t('settings.recipes.label')}</p>
                  <p className="text-sm text-foreground-muted">
                    {t('settings.recipes.description')}
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
