import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActivityEntry } from '@/hooks/useHouseholdActivity'
import { formatDateTime } from '@/lib/formatDate'
import { convertDetectedLanguage } from '@/lib/language'
import { activitySentence } from './activitySentence'

export interface ActivityListProps {
  /** The log rows, newest first, as `useHouseholdActivity` gives them. */
  entries: ActivityEntry[]
  /**
   * The `<ol>`. The page uses it to move focus to the first row of a page
   * that "Load more" added. Every row has `tabIndex={-1}` for that.
   */
  listRef?: Ref<HTMLOListElement>
}

/**
 * The household activity log (households H6, task J.6). One row per change:
 * a full sentence (`activitySentence`) and when it happened.
 *
 * Names render as stored: no `capitalize` anywhere (Name Display
 * Convention). A deleted account shows its stored name with
 * "(deleted account)" after it (owner decision O35-A).
 */
export function ActivityList({ entries, listRef }: ActivityListProps) {
  const { t, i18n } = useTranslation()
  const language = convertDetectedLanguage(i18n.language ?? 'en')

  if (entries.length === 0) {
    return (
      <p className="px-4 py-4 text-foreground-muted">
        {t('settings.household.activity.empty')}
      </p>
    )
  }

  return (
    <ol ref={listRef} className="space-y-px">
      {entries.map((entry) => (
        <li
          key={entry.id}
          tabIndex={-1}
          className="bg-background-surface px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p data-activity-sentence className="text-sm">
            {activitySentence(entry, t)}
          </p>
          <time
            dateTime={entry.createdAt}
            className="text-xs text-foreground-muted"
          >
            {formatDateTime(new Date(entry.createdAt), language)}
          </time>
        </li>
      ))}
    </ol>
  )
}
