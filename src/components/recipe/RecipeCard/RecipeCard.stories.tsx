import type { Meta, StoryObj } from '@storybook/react'
import type { Recipe } from '@/types'
import { RecipeCard } from '.'

const meta: Meta<typeof RecipeCard> = {
  title: 'Components/RecipeCard',
  component: RecipeCard,
}

export default meta
type Story = StoryObj<typeof RecipeCard>

const recipe: Recipe = {
  id: '1',
  name: 'Pasta Dinner',
  items: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const Default: Story = {
  args: {
    recipe,
    onDelete: () => console.log('Delete Pasta Dinner'),
  },
}

export const WithItemCount: Story = {
  args: {
    recipe,
    itemCount: 6,
    onDelete: () => console.log('Delete Pasta Dinner'),
  },
}

export const WithNoItems: Story = {
  args: {
    recipe,
    itemCount: 0,
    onDelete: () => console.log('Delete Pasta Dinner'),
  },
}
