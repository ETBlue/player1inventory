import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { noopApolloClient } from '@/test/apolloStub'
import { TagColor } from '@/types'
import { TagBadge } from '.'

const queryClient = new QueryClient()

const meta: Meta<typeof TagBadge> = {
  title: 'Components/Tag/TagBadge',
  component: TagBadge,
  decorators: [
    (Story) => (
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      </ApolloProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TagBadge>

export const Default: Story = {
  args: {
    tag: { id: '1', name: 'Dairy', typeId: 'type-1' },
    tagType: { id: 'type-1', name: 'Category', color: TagColor.teal },
    onClick: () => console.log('Clicked!'),
  },
}

export const WithCountProp: Story = {
  args: {
    tag: { id: '2', name: 'Frozen', typeId: 'type-2' },
    tagType: { id: 'type-2', name: 'Preservation', color: TagColor.cyan },
    count: 42,
  },
}

export const DifferentColors: Story = {
  render: () => {
    const tagColors = Object.values(TagColor) as TagColor[]

    return (
      <div className="inline-grid grid-cols-1 justify-items-start gap-2">
        {tagColors.map((color, _index) => (
          <>
            <TagBadge
              key={color}
              tag={{ id: color, name: color, typeId: color }}
              tagType={{ id: color, name: color, color }}
              onClick={() => {}}
            />
          </>
        ))}
      </div>
    )
  },
}
