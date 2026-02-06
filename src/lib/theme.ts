export type ThemePreference = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme-preference'
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

declare global {
  interface Window {
    __THEME_INIT__?: {
      preference: ThemePreference
      applied: Theme
    }
  }
}
