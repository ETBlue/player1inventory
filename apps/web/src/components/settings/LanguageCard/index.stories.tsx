import type { Meta, StoryObj } from '@storybook/react'
import { LANGUAGE_STORAGE_KEY } from '@/lib/language'
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

export const AutoLanguage: Story = {
  beforeEach() {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  },
}

export const ExplicitEnglish: Story = {
  beforeEach() {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    return () => localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  },
}

export const ExplicitChineseTraditional: Story = {
  beforeEach() {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw')
    return () => localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  },
}
