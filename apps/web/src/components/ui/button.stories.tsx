import type { Meta, StoryObj } from '@storybook/react'
import { PlusIcon } from 'lucide-react'
import { TagColor } from '@/types'
import { Button } from './button'

const meta: Meta<typeof Button> = {
  title: 'UI Library/Button',
  component: Button,
}

export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: {
    children: 'Button',
  },
}

export const Variants: Story = {
  render: () => {
    const baseVariants = [
      'primary',
      'secondary',
      'tertiary',
      'destructive',
      'neutral',
    ] as const

    const colors = Object.values(TagColor) as TagColor[]

    return (
      <div className="space-y-8">
        {/* Semantic Variants */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Semantic Variants</h3>
          <div className="inline-grid grid-cols-4 gap-2">
            {baseVariants.map((base) => (
              <>
                <Button variant={base}>{base}</Button>
                <Button variant={`${base}-outline` as `${typeof base}-outline`}>
                  {`${base}-outline`}
                </Button>
                <Button variant={`${base}-ghost` as `${typeof base}-ghost`}>
                  {`${base}-ghost`}
                </Button>
                <Button variant={`${base}-link` as `${typeof base}-link`}>
                  {`${base}-link`}
                </Button>
              </>
            ))}
          </div>
        </div>

        {/* Color Variants */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Color Variants</h3>
          <div className="space-y-2">
            {colors.map((color) => (
              <div key={color} className="flex gap-2">
                <Button className="w-30" variant={color}>
                  {color}
                </Button>
                <Button className="w-30" variant={`${color}-tint`}>
                  {color}-tint
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="xs">XSmall</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon-xs">
        <PlusIcon />
      </Button>
      <Button size="icon-sm">
        <PlusIcon />
      </Button>
      <Button size="icon">
        <PlusIcon />
      </Button>
      <Button size="icon-lg">
        <PlusIcon />
      </Button>
    </div>
  ),
}

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
}
