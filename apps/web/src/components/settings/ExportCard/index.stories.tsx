import type { Meta, StoryObj } from '@storybook/react'
import { ExportCard } from '.'

const meta: Meta<typeof ExportCard> = {
  title: 'Settings/ExportCard',
  component: ExportCard,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ExportCard>

export const Default: Story = {}
