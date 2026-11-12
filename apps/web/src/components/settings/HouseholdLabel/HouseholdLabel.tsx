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
 * Used by the desktop sidebar link, the household sidebar heading, the
 * household page title and the mobile accordion trigger, so all four always
 * say the same thing. The same idea as `UserLabel` for the 👤 entry.
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
