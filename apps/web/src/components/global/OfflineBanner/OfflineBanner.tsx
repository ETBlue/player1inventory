import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLastSyncedAt } from '@/apollo/persistence'
import { useIsOffline } from '@/hooks/useIsOffline'

interface OfflineBannerProps {
  /** Overrides the stored value. Used by Storybook and tests. */
  lastSyncedAt?: Date | null
  /** Overrides the real connection state. Used by Storybook and tests. */
  forceOffline?: boolean
}

function formatRelative(date: Date, locale: string): string {
  const minutes = Math.round((date.getTime() - Date.now()) / 60000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.round(hours / 24), 'day')
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
    void getLastSyncedAt().then(setStoredSyncedAt)
  }, [lastSyncedAt])

  if (!offline) return null

  const syncedAt = lastSyncedAt ?? storedSyncedAt

  return (
    // <output> carries an implicit ARIA role of "status" (announces to screen
    // readers without moving focus) — Biome's useSemanticElements rule blocks
    // an explicit role="status" on a <div> in favor of this element.
    <output className="bg-background-surface text-foreground-muted border-accessory-default block w-full border-b px-4 py-2 text-center text-sm">
      <span className="font-medium">{t('pwa.offlineTitle')}</span>
      {' — '}
      {syncedAt
        ? t('pwa.offlineSyncedAt', {
            time: formatRelative(syncedAt, i18n.language),
          })
        : t('pwa.offlineNeverSynced')}
    </output>
  )
}
