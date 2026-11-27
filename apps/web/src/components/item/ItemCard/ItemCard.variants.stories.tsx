// src/components/ItemCard.variants.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from '.'
import {
  mockItem,
  mockLastPurchase,
  mockMultipleTags,
  mockMultipleTagTypes,
  mockRecipes,
  mockTags,
  mockTagTypes,
  mockVendors,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/Item/ItemCard/Variants',
  component: ItemCard,
  decorators: [sharedDecorator],
  // Every story inherits the date; a story that wants another one
  // overrides it in its own `args`.
  args: { lastPurchaseDate: mockLastPurchase },
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const TagsHidden: Story = {
  name: 'Tags hidden (shows summary)',
  args: {
    item: mockItem,
    tags: mockTags,
    tagTypes: mockTagTypes,
    showTags: false,
    showTagSummary: true,
  },
}

export const MultipleTags: Story = {
  name: 'Multiple tags (4 colors)',
  args: {
    item: { ...mockItem, tagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'] },
    tags: mockMultipleTags,
    tagTypes: mockMultipleTagTypes,
  },
}

export const VendorsAndRecipesCollapsed: Story = {
  name: 'Vendors & recipes — Collapsed (summary)',
  args: {
    item: mockItem,
    tags: mockTags,
    tagTypes: mockTagTypes,
    showTags: false,
    showTagSummary: true,
    vendors: mockVendors,
    recipes: mockRecipes,
  },
}

export const VendorsAndRecipesExpanded: Story = {
  name: 'Vendors & recipes — Expanded (with click handlers)',
  args: {
    item: mockItem,
    tags: mockTags,
    tagTypes: mockTagTypes,
    showTags: true,
    vendors: mockVendors,
    recipes: mockRecipes,
    onVendorClick: (vendorId) => console.log('Vendor clicked:', vendorId),
    onRecipeClick: (recipeId) => console.log('Recipe clicked:', recipeId),
  },
}

export const ActiveTagFilter: Story = {
  name: 'Active tag filter (some highlighted)',
  args: {
    item: { ...mockItem, tagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'] },
    tags: mockMultipleTags,
    tagTypes: mockMultipleTagTypes,
    activeTagIds: ['tag-1', 'tag-3'],
  },
}

export const ActiveVendorFilter: Story = {
  name: 'Active vendor filter (Costco highlighted)',
  args: {
    item: mockItem,
    tags: mockTags,
    tagTypes: mockTagTypes,
    showTags: true,
    vendors: mockVendors,
    recipes: mockRecipes,
    activeVendorIds: ['v1'],
  },
}

// A non-consumable item (cups): the card shows one square per piece instead
// of the progress bar, and no expiry.
export const NonConsumable: Story = {
  name: 'Not consumable (count squares)',
  args: {
    item: {
      ...mockItem,
      id: 'cups',
      name: 'Cups',
      packageUnit: 'cup',
      targetUnit: 'package',
      packedQuantity: 4,
      unpackedQuantity: 0,
      targetQuantity: 6,
      refillThreshold: 2,
      consumable: false,
    },
    tags: [],
    tagTypes: [],
  },
}
