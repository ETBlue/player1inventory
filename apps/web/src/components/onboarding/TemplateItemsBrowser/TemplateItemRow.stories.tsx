import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagColor } from '@/types'
import { TemplateItemRow } from './TemplateItemRow'

// TagBadge uses useItemCountByTag — requires QueryClientProvider.
// No router context needed (TemplateItemRow has no <Link>).
const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <Story />
  </QueryClientProvider>
)

const mockTagTypes = [
  { id: 'category', name: 'Category', color: TagColor.lime },
  { id: 'preservation', name: 'Preservation', color: TagColor.cyan },
]

const mockTags = [
  { id: 'grain', name: 'Grain', typeId: 'category' },
  { id: 'room-temperature', name: 'Room temperature', typeId: 'preservation' },
]

const meta: Meta<typeof TemplateItemRow> = {
  title: 'Components/Onboarding/TemplateItemRow',
  component: TemplateItemRow,
  decorators: [withQueryClient],
  args: {
    name: 'Rice',
    tags: [],
    tagTypes: mockTagTypes,
    isChecked: false,
    onToggle: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateItemRow>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: {
    isChecked: true,
    tags: mockTags,
  },
}
