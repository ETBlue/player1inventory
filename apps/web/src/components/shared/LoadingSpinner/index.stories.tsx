import type { Meta, StoryObj } from '@storybook/react'
import { LoadingSpinner } from '.'

const meta = {
  title: 'Components/Shared/LoadingSpinner',
  component: LoadingSpinner,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LoadingSpinner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
