import type { Meta, StoryObj } from '@storybook/react'
import { PlusIcon } from 'lucide-react'
import { Button } from './button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
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

    return (
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
    )
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="mini">mini</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon-mini">
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
