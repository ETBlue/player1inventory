import { useCallback, useEffect, useState } from 'react'
import i18n from '@/i18n'
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  detectBrowserLanguage,
  LANGUAGE_STORAGE_KEY,
  type Language,
  type LanguagePreference,
} from '@/lib/language'

function resolveLanguage(preference: LanguagePreference): Language {
  if (preference === 'auto') return detectBrowserLanguage()
  return preference
}

function getInitialPreference(): LanguagePreference {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored === 'en' || stored === 'tw') return stored
  return DEFAULT_LANGUAGE_PREFERENCE
}

export function useLanguage() {
  const [preference, setPreferenceState] =
    useState<LanguagePreference>(getInitialPreference)
  const language = resolveLanguage(preference)

  useEffect(() => {
    i18n.changeLanguage(language)
  }, [language])

  const setPreference = useCallback((pref: LanguagePreference) => {
    if (pref === 'auto') {
      localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    } else {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, pref)
    }
    setPreferenceState(pref)
  }, [])

  return { preference, language, setPreference }
}
