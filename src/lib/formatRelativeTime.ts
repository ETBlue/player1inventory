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
