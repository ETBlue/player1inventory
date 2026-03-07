// src/components/ItemCard.assignment.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from './ItemCard'
import {
  mockItem,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard/Assignment',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

const baseArgs = {
  item: mockItem,
  tags: mockTags,
  tagTypes: mockTagTypes,
}

export const TagChecked: Story = {
  name: 'Tag assignment — Checked',
  args: {
    ...baseArgs,
    mode: 'tag-assignment',
    isChecked: true,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}

export const TagUnchecked: Story = {
  name: 'Tag assignment — Unchecked',
  args: {
    ...baseArgs,
    mode: 'tag-assignment',
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}

export const RecipeAssigned: Story = {
  name: 'Recipe assignment — Assigned (amount controls visible)',
  args: {
    ...baseArgs,
    mode: 'recipe-assignment',
    isChecked: true,
    controlAmount: 2,
    onCheckboxToggle: () => console.log('Toggle assignment'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const RecipeUnassigned: Story = {
  name: 'Recipe assignment — Unassigned',
  args: {
    ...baseArgs,
    mode: 'recipe-assignment',
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}
