import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clearHouseholdChangedNotice,
  readHouseholdChangedNotice,
} from '@/apollo/householdGuard'
import { Button } from '@/components/ui/button'

/**
 * The one-time message after a tab was moved to another household
 * (households H7 task L.3, owner decision O51-A). Cloud mode only;
 * `__root.tsx` mounts it beside `OfflineBanner`.
 *
 * `recoverFromHouseholdChange` (`apollo/householdGuard.ts`) stores the
 * message just before it reloads the page. This component reads it once,
 * when it mounts, and removes it from this tab's `sessionStorage` at once
 * (not `localStorage`: the message is for this tab only). So the message shows
 * on the first load after the move and never again, also when the person
 * reloads while it is on screen. It stays on screen until the person
 * closes it.
 *
 * Without the old household's name (the cache did not hold it), the text
 * says "another household". Household names render as stored, never with
 * `capitalize` (root `CLAUDE.md`).
 */
export function HouseholdChangedNotice() {
  const { t } = useTranslation()
  // Read in the initializer, so the first render already shows it. The
  // removal is in an effect: an initializer must not change anything.
  const [notice, setNotice] = useState(readHouseholdChangedNotice)

  useEffect(() => {
    clearHouseholdChangedNotice()
  }, [])

  if (!notice) return null

  const text = notice.oldHousehold
    ? t('householdChanged.notice', {
        household: notice.household,
        oldHousehold: notice.oldHousehold,
      })
    : t('householdChanged.noticeNoOldName', { household: notice.household })

  return (
    <div className="bg-background-surface border-accessory-default flex w-full flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
      {/*
        <output> has the implicit role "status", so a screen reader reads
        the message without moving the focus.
      */}
      <output className="text-foreground min-w-0 flex-1">{text}</output>
      <Button size="sm" variant="neutral-ghost" onClick={() => setNotice(null)}>
        {t('householdChanged.close')}
      </Button>
    </div>
  )
}
