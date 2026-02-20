import type { Meta, StoryObj } from '@storybook/react'
import { Filter, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toolbar } from './Toolbar'

const meta = {
  title: 'Components/Toolbar',
  component: Toolbar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Toolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <>
        <Button size="icon" variant="neutral-ghost" aria-label="Filter">
          <Filter />
        </Button>
        <span className="flex-1" />
        <Button>
          <Plus />
          Add item
        </Button>
      </>
    ),
  },
}

export const WithJustifyBetween: Story = {
  args: {
    className: 'justify-between',
    children: (
      <>
        <span className="font-bold text-lg">Page Title</span>
        <Button>
          <Plus />
          New
        </Button>
      </>
    ),
  },
}
