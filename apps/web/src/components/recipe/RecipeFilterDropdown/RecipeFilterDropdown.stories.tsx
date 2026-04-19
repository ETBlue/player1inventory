import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Recipe } from '@/types'
import { RecipeFilterDropdown } from './RecipeFilterDropdown'

const queryClient = new QueryClient()

const meta: Meta<typeof RecipeFilterDropdown> = {
  title: 'Components/Recipe/RecipeFilterDropdown',
  component: RecipeFilterDropdown,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof RecipeFilterDropdown>

const recipes = [
  { id: 'r1', name: 'Pasta', items: [{ itemId: 'i1' }, { itemId: 'i2' }] },
  { id: 'r2', name: 'Soup', items: [{ itemId: 'i2' }, { itemId: 'i3' }] },
] as unknown as Recipe[]

export const Default: Story = {
  args: { recipes, selectedIds: [], onToggle: () => {}, onClear: () => {} },
}

export const WithSelections: Story = {
  args: { recipes, selectedIds: ['r1'], onToggle: () => {}, onClear: () => {} },
}
