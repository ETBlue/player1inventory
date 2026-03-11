import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import tw from './locales/tw.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      tw: { translation: tw },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'tw'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18n-language',
      convertDetectedLanguage: (lng: string) => {
        if (lng.startsWith('zh')) return 'tw'
        return 'en'
      },
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
