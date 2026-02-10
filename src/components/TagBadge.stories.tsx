import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagColor } from '@/types'
import { TagBadge } from './TagBadge'

const queryClient = new QueryClient()

const meta: Meta<typeof TagBadge> = {
  title: 'Components/TagBadge',
  component: TagBadge,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
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
