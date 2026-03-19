import type { Preview, Decorator } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'
import { themes } from 'storybook/theming'
import i18n from '../src/i18n'
import { LANGUAGE_STORAGE_KEY, resolveLanguageFromStorage } from '../src/lib/language'
import '../src/index.css'
import './docs-theme.css'

// Custom decorator to sync Docs theme with theme toggle
const withDocsTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme || 'light'

  // Apply theme class to body element for Docs page
  if (typeof window !== 'undefined') {
    if (theme === 'dark') {
      document.body.classList.add('dark')
    } else {
      document.body.classList.remove('dark')
    }
  }

  return Story()
}

const withI18n: Decorator = (Story, context) => {
  const locale = (context.globals.locale as string) ?? 'auto'

  if (locale === 'auto') {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    i18n.changeLanguage(resolveLanguageFromStorage())
  } else {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale)
    i18n.changeLanguage(locale)
  }

  return Story()
}

const preview: Preview = {
  globalTypes: {
    locale: {
      description: 'Active language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'auto', title: 'Auto' },
          { value: 'en',   title: 'EN' },
          { value: 'tw',   title: 'TW' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    locale: 'auto',
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      theme: themes.light,
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
    withDocsTheme,
    withI18n,
  ],
}

export default preview
