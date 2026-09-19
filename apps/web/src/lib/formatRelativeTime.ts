import { LANGUAGE_LOCALE, type Language } from './language'

export function formatRelativeTime(date: Date, language: Language): string {
  const locale = LANGUAGE_LOCALE[language]
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  const diffMs = date.getTime() - Date.now()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const absDays = Math.abs(diffDays)

  if (absDays >= 365) return rtf.format(Math.round(diffDays / 365), 'year')
  if (absDays >= 30) return rtf.format(Math.round(diffDays / 30), 'month')
  if (absDays >= 7) return rtf.format(Math.round(diffDays / 7), 'week')
  return rtf.format(diffDays, 'day')
}

/**
 * Like `formatRelativeTime`, but with minute and hour steps.
 *
 * The offline banner needs them. "12 minutes ago" and "3 hours ago" are very
 * different answers to "is this data worth trusting?", and
 * `formatRelativeTime` calls both of them "today".
 *
 * Anything a day old or older is handed to `formatRelativeTime`, so the
 * day / week / month / year wording has one implementation, not two.
 */
export function formatRelativeTimeWithHours(
  date: Date,
  language: Language,
): string {
  const rtf = new Intl.RelativeTimeFormat(LANGUAGE_LOCALE[language], {
    numeric: 'auto',
  })

  const minutes = Math.round((date.getTime() - Date.now()) / 60000)
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')

  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')

  return formatRelativeTime(date, language)
}
