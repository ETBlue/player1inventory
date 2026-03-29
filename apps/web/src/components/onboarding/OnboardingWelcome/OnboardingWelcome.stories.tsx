import type { Meta, StoryObj } from '@storybook/react'
import { OnboardingWelcome } from '.'

const meta: Meta<typeof OnboardingWelcome> = {
  title: 'Components/Onboarding/OnboardingWelcome',
  component: OnboardingWelcome,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onChooseTemplate: () => {},
    onStartFromScratch: () => {},
  },
}

export default meta
type Story = StoryObj<typeof OnboardingWelcome>

export const Default: Story = {}
