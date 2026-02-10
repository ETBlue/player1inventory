import type { Meta, StoryObj } from '@storybook/react'
import { TagColor } from '@/types'
import { Badge } from './badge'

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: {
    children: 'Badge',
  },
}

export const Variants: Story = {
  render: () => {
    const tagColors = Object.values(TagColor) as TagColor[]
    const hueColors = tagColors.filter((t) => !t.match(/tint/))

    const statusAndImportanceColors = [
      'ok',
      'warning',
      'error',
      'inactive',
      'primary',
      'secondary',
      'tertiary',
      'destructive',
      'neutral',
    ] as const

    return (
      <div className="inline-grid grid-cols-[auto_auto] justify-items-start gap-2">
        {hueColors.map((color) => (
          <>
            <Badge variant={color}>{color}</Badge>
            <Badge variant={`${color}-tint` as TagColor}>
              {`${color}-tint`}
            </Badge>
          </>
        ))}

        {statusAndImportanceColors.map((color) => (
          <>
            <Badge variant={color}>{color}</Badge>
            <Badge variant={`${color}-outline` as `${typeof color}-outline`}>
              {`${color}-outline`}
            </Badge>
          </>
        ))}
      </div>
    )
  },
}
