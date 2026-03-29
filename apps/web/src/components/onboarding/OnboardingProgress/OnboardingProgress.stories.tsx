import type { Meta, StoryObj } from '@storybook/react'
import { OnboardingProgress } from '.'

const meta: Meta<typeof OnboardingProgress> = {
  title: 'Components/Onboarding/OnboardingProgress',
  component: OnboardingProgress,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onGetStarted: () => {},
  },
}

export default meta
type Story = StoryObj<typeof OnboardingProgress>

export const InProgress: Story = {
  args: {
    progress: 50,
    isComplete: false,
  },
}

export const Complete: Story = {
  args: {
    progress: 100,
    isComplete: true,
  },
}
