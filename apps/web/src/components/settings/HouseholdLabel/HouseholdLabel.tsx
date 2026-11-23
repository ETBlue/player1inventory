import { useTranslation } from 'react-i18next'
import { useHousehold } from '@/hooks/useHousehold'

/**
 * The label of the 🏠 entry: the household's name in cloud mode, and "My
 * data" (`settings.household.title`) in local mode (households H3a, task
 * 3.13).
 *
 * In cloud mode it also says "My data" while the name is loading, and when it
 * cannot be read, so the label is never empty.
 *
 * Used by the desktop sidebar link, the household sidebar heading and the
 * mobile accordion trigger, so all three always say the same thing. (The
 * household page title used it until 2026-11-23; it now says "General".)
 * The same idea as `UserLabel` for the 👤 entry.
 *
 * The name is shown as stored. No `capitalize`: a household name is chosen by
 * its owner, like a vendor or location name (root `CLAUDE.md`, *Name Display
 * Convention*).
 */
export function HouseholdLabel() {
  const { t } = useTranslation()
  const { data } = useHousehold()
  return <>{data?.name || t('settings.household.title')}</>
}
