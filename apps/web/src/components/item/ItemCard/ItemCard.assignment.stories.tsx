// src/components/ItemCard.assignment.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from '.'
import {
  mockItem,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/Item/ItemCard/Assignment',
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

export const RecipeAssignedMinusPending: Story = {
  name: 'Recipe assignment — minus pending',
  args: {
    ...RecipeAssigned.args,
    isPending: true,
    disabled: true,
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

// mockItem is below its refill threshold, so with the default showStock the
// card renders the error tint, the quantity (with its trailing unit) and the bar.
// This is how the four Settings assignment tabs render it: a global
// item↔entity row with no trace of the active location's stock.
export const TagAssignmentNoStock: Story = {
  name: 'Tag assignment — stock hidden (global page)',
  args: {
    ...baseArgs,
    mode: 'tag-assignment',
    isChecked: false,
    showStock: false,
    showTags: false,
    showTagSummary: false,
    showExpiration: false,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}

export const InactiveNoStock: Story = {
  name: 'Tag assignment — inactive item, stock hidden (no dimming)',
  args: {
    ...TagAssignmentNoStock.args,
    // targetQuantity 0 is "inactive" in the active location only — with stock
    // hidden the row must not be dimmed or labelled inactive.
    item: { ...mockItem, targetQuantity: 0, refillThreshold: 0 },
  },
}
