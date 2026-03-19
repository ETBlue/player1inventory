import type { Meta, StoryObj } from '@storybook/react'
import { LanguageCard } from '.'

const meta: Meta<typeof LanguageCard> = {
  title: 'Settings/LanguageCard',
  component: LanguageCard,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof LanguageCard>

export const Default: Story = {}
