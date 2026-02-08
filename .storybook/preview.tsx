import type { Preview, Decorator } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'
import { themes } from 'storybook/theming'
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

const preview: Preview = {
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
  ],
}

export default preview
