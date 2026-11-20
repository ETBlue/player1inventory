import { LANGUAGE_LOCALE, type Language } from './language'

export function formatDate(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(LANGUAGE_LOCALE[language], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/**
 * The date and the time, for a row that says when something happened (the
 * household activity log, households H6 task J.6). An invalid date gives
 * `''`: `Intl` throws a `RangeError` for it, and one bad row must not break
 * a page.
 */
export function formatDateTime(date: Date, language: Language): string {
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(LANGUAGE_LOCALE[language], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
