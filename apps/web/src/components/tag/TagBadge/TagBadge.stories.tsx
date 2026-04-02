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
    const colors = tagColors.filter((t) => !t.match(/tint/g))
    const tintColors = tagColors.filter((t) => t.match(/tint/g))

    return (
      <div className="inline-grid grid-cols-2 justify-items-start gap-2">
        {colors.map((color, index) => (
          <>
            <TagBadge
              key={color}
              tag={{ id: color, name: color, typeId: color }}
              tagType={{ id: color, name: color, color }}
              onClick={() => {}}
            />
            <TagBadge
              key={tintColors[index]}
              tag={{
                id: tintColors[index],
                name: tintColors[index],
                typeId: tintColors[index],
              }}
              tagType={{
                id: tintColors[index],
                name: tintColors[index],
                color: tintColors[index],
              }}
              onClick={() => {}}
            />
          </>
        ))}
      </div>
    )
  },
}
