import type { Meta, StoryObj } from '@storybook/react'
import { ThemeCard } from '.'

const meta: Meta<typeof ThemeCard> = {
  title: 'Settings/ThemeCard',
  component: ThemeCard,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ThemeCard>

export const LightPreference: Story = {
  beforeEach() {
    localStorage.setItem('theme-preference', 'light')
    return () => localStorage.removeItem('theme-preference')
  },
}

export const DarkPreference: Story = {
  beforeEach() {
    localStorage.setItem('theme-preference', 'dark')
    return () => localStorage.removeItem('theme-preference')
  },
}

export const SystemPreference: Story = {
  beforeEach() {
    localStorage.removeItem('theme-preference')
  },
}
