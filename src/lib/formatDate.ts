import { LANGUAGE_LOCALE, type Language } from './language'

export function formatDate(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(LANGUAGE_LOCALE[language], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
