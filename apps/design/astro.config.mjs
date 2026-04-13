import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'Player 1 Inventory — Design Guide',
      social: {},
      sidebar: [
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
      ],
    }),
  ],
})
