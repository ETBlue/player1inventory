import type { Meta, StoryObj } from '@storybook/react'
import { PantryControlBar } from './PantryControlBar'

const meta: Meta<typeof PantryControlBar> = {
  title: 'Components/Pantry/PantryControlBar',
  component: PantryControlBar,
  parameters: {
    layout: 'padded',
  },
  args: {
    allShelfIds: ['shelf-1', 'shelf-2', 'shelf-3'],
    onExpandAll: () => {},
    onCollapseAll: () => {},
  },
}

export default meta
type Story = StoryObj<typeof PantryControlBar>

export const AllCollapsed: Story = {
  args: {
    expandedIds: new Set(),
  },
}

export const AllExpanded: Story = {
  args: {
    expandedIds: new Set(['shelf-1', 'shelf-2', 'shelf-3']),
  },
}

export const Mixed: Story = {
  args: {
    expandedIds: new Set(['shelf-1']),
  },
}
