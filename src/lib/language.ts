// src/lib/language.ts
export type LanguagePreference = 'auto' | 'en' | 'tw'
export type Language = 'en' | 'tw'

export const LANGUAGE_STORAGE_KEY = 'i18n-language'
export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'auto'

/** Maps a Language value to its BCP 47 locale string for Intl APIs. */
export const LANGUAGE_LOCALE: Record<Language, string> = {
  en: 'en-US',
  tw: 'zh-TW',
}

/**
 * Resolves the active Language from localStorage + navigator.language.
 * Safe to call outside React (e.g. from db initialization).
 */
export function resolveLanguageFromStorage(): Language {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored === 'en' || stored === 'tw') return stored
  return detectBrowserLanguage()
}

export function detectBrowserLanguage(): Language {
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('zh')) return 'tw'
  return 'en'
}
