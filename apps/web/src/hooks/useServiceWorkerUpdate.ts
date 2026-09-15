import { registerSW } from 'virtual:pwa-register'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/**
 * Registers the service worker and asks the user to reload when a new
 * version is ready. The app never reloads on its own, so a user who is
 * typing is never interrupted.
 */
export function useServiceWorkerUpdate(): void {
  const { t } = useTranslation()

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        toast(t('pwa.updateAvailable'), {
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: t('pwa.reload'),
            onClick: () => {
              void updateSW(true)
            },
          },
        })
      },
    })
  }, [t])
}
