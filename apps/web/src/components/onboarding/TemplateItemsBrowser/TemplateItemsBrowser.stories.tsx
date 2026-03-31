import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplateItemsBrowser } from '.'

// TemplateItemRow uses TagBadge which calls useItemCountByTag — needs QueryClient.
// Router context is no longer needed (TemplateItemRow has no <Link>).
const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <Story />
  </QueryClientProvider>
)

const meta: Meta<typeof TemplateItemsBrowser> = {
  title: 'Components/Onboarding/TemplateItemsBrowser',
  component: TemplateItemsBrowser,
  decorators: [withQueryClient],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onSelectionChange: () => {},
    onBack: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateItemsBrowser>

export const AllItems: Story = {
  args: {
    selectedKeys: new Set(),
  },
}

export const WithSelections: Story = {
  args: {
    selectedKeys: new Set(['rice', 'eggs', 'milk', 'toothpaste', 'dish-soap']),
  },
}
