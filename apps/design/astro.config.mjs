import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  integrations: [
    starlight({
      title: 'Player 1 Inventory — Design Guide',
      customCss: ['./src/styles/custom.css'],
      social: {
        github: 'https://github.com/ETBlue/player1inventory',
      },
      sidebar: [
        { label: 'Principles', slug: 'principles' },
        {
          label: 'Tokens',
          items: [
            { label: 'Colors', slug: 'tokens/colors' },
            { label: 'Typography', slug: 'tokens/typography' },
            { label: 'Spacing', slug: 'tokens/spacing' },
            { label: 'Motion', slug: 'tokens/motion' },
          ],
        },
        {
          label: 'Components',
          autogenerate: { directory: 'components' },
        },
        {
          label: 'Patterns',
          items: [
            { label: 'Filter Pipeline', slug: 'patterns/filter-pipeline' },
            { label: 'Forms', slug: 'patterns/forms' },
            { label: 'Empty States', slug: 'patterns/empty-states' },
          ],
        },
        {
          label: 'Accessibility',
          items: [
            { label: 'Overview', slug: 'accessibility/overview' },
            { label: 'Color Contrast', slug: 'accessibility/color-contrast' },
            { label: 'Keyboard Navigation', slug: 'accessibility/keyboard-navigation' },
          ],
        },
        {
          label: 'Voice & Tone',
          items: [
            { label: 'Overview', slug: 'voice-tone/overview' },
            { label: 'Copy Guidelines', slug: 'voice-tone/copy-guidelines' },
          ],
        },
        {
          label: '↗ Storybook',
          link: 'https://storybook.player1inventory.etblue.tw',
          attrs: { target: '_blank', rel: 'noopener noreferrer' },
        },
      ],
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@web': path.resolve(__dirname, '../web/src'),
        '@': path.resolve(__dirname, '../web/src'),
      },
    },
  },
})
