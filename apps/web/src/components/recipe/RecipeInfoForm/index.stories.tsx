import type { Meta, StoryObj } from '@storybook/react'
import type { Recipe } from '@/types'
import { RecipeInfoForm } from '.'

const baseRecipe: Recipe = {
  id: 'recipe-1',
  name: 'Pasta Dinner',
  items: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const meta: Meta<typeof RecipeInfoForm> = {
  title: 'Components/Recipe/RecipeInfoForm',
  component: RecipeInfoForm,
  args: {
    onSave: () => {},
    onDirtyChange: () => {},
  },
}
export default meta
type Story = StoryObj<typeof RecipeInfoForm>

export const Default: Story = {
  args: {
    recipe: baseRecipe,
  },
}

export const WithValidationError: Story = {
  args: {
    recipe: { ...baseRecipe, name: '' },
  },
}

export const Dirty: Story = {
  args: {
    // The name is different from the original — simulating a user edit.
    // Since committedName is initialised from recipe.name, use a different value
    // to demonstrate the dirty state. In a real scenario the user would type to get dirty.
    recipe: { ...baseRecipe, name: 'Pasta Dinner (modified)' },
  },
}

export const Saving: Story = {
  args: {
    recipe: { ...baseRecipe, name: 'Pasta Dinner (saving)' },
    isPending: true,
  },
}
