import type { Meta, StoryObj } from '@storybook/react'
import { TagColor } from '@/types'
import { Badge } from './badge'

const meta: Meta<typeof Badge> = {
  title: 'UI Library/Badge',
  component: Badge,
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

    const statusColors = ['ok', 'warning', 'error', 'inactive'] as const

    const importanceColors = [
      'primary',
      'secondary',
      'tertiary',
      'destructive',
      'neutral',
    ] as const

    return (
      <div className="space-y-4">
        <h2>Importance</h2>
        <div className="inline-grid grid-cols-[auto_auto] justify-items-start gap-2">
          {importanceColors.map((color) => (
            <>
              <Badge variant={color}>{color}</Badge>
              <Badge variant={`${color}-outline` as `${typeof color}-outline`}>
                {`${color}-outline`}
              </Badge>
            </>
          ))}
        </div>
        <h2>Status</h2>

        <div className="inline-grid grid-cols-[auto_auto] justify-items-start gap-2">
          {statusColors.map((color) => (
            <>
              <Badge variant={color}>{color}</Badge>
              <Badge variant={`${color}-inverse` as TagColor}>
                {`${color}-inverse`}
              </Badge>
            </>
          ))}
        </div>
        <h2>Tag</h2>

        <div className="inline-grid grid-cols-[auto_auto] justify-items-start gap-2">
          {tagColors.map((color) => (
            <>
              <Badge variant={color}>{color}</Badge>
              <Badge variant={`${color}-inverse` as TagColor}>
                {`${color}-inverse`}
              </Badge>
            </>
          ))}
        </div>
      </div>
    )
  },
}
