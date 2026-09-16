import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLastSyncedAt } from '@/apollo/persistence'
import { useIsOffline } from '@/hooks/useIsOffline'
import { formatRelativeTimeWithHours } from '@/lib/formatRelativeTime'
import { convertDetectedLanguage } from '@/lib/language'

interface OfflineBannerProps {
  /** Overrides the stored value. Used by Storybook and tests. */
  lastSyncedAt?: Date | null
  /** Overrides the real connection state. Used by Storybook and tests. */
  forceOffline?: boolean
}

/**
 * Tells the user the app is offline and when the shown data was synced.
 *
 * The time matters. Without it, old pantry data looks current, and the user
 * cannot tell whether it is worth trusting.
 */
export function OfflineBanner({
  lastSyncedAt,
  forceOffline,
}: OfflineBannerProps) {
  const { t, i18n } = useTranslation()
  const detectedOffline = useIsOffline()
  const offline = forceOffline ?? detectedOffline
  const [storedSyncedAt, setStoredSyncedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (lastSyncedAt !== undefined) return
    // Read only while offline, and read again every time the connection state
    // changes. The banner mounts once, at app start, and the stored value
    // keeps moving while the app is online, so a single read on mount would
    // report the time as of app start. `offline` must stay in the dependency
    // list AND be read here — a dependency Biome cannot see used gets removed
    // by `biome check --write`, which is how this bug came back once already.
    if (!offline) return
    void getLastSyncedAt().then(setStoredSyncedAt)
  }, [lastSyncedAt, offline])

  if (!offline) return null

  const syncedAt = lastSyncedAt ?? storedSyncedAt

  // `i18n.language` is 'en' or 'tw'. 'tw' is a real BCP 47 subtag — it means
  // Twi — so passing it straight to Intl does not throw; it silently formats
  // in English. `convertDetectedLanguage` maps it to the app's Language, and
  // the helper maps that to 'zh-TW'.
  const language = convertDetectedLanguage(i18n.language)

  return (
    // <output> carries an implicit ARIA role of "status" (announces to screen
    // readers without moving focus) — Biome's useSemanticElements rule blocks
    // an explicit role="status" on a <div> in favor of this element.
    <output className="bg-background-surface text-foreground-muted border-accessory-default block w-full border-b px-4 py-2 text-center text-sm">
      <span className="font-medium">{t('pwa.offlineTitle')}</span>
      {' — '}
      {syncedAt
        ? t('pwa.offlineSyncedAt', {
            time: formatRelativeTimeWithHours(syncedAt, language),
          })
        : t('pwa.offlineNeverSynced')}
    </output>
  )
}
