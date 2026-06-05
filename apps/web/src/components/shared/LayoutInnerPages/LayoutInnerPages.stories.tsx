import type { Meta, StoryObj } from '@storybook/react'
import { Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LayoutInnerPages } from '.'

const meta = {
  title: 'Components/Shared/LayoutInnerPages',
  component: LayoutInnerPages,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof LayoutInnerPages>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Page Title',
    children: <div className="p-4">Main content area</div>,
  },
}

export const WithIcon: Story = {
  args: {
    title: 'Tagged Item',
    icon: <Tags className="h-4 w-4 text-foreground-muted" />,
    children: <div className="p-4">Main content area</div>,
  },
}

export const WithToolbarEnd: Story = {
  args: {
    title: 'Page Title',
    toolbarEnd: (
      <Button variant="neutral-ghost" size="icon" aria-label="Delete">
        Delete
      </Button>
    ),
    children: <div className="p-4">Main content area</div>,
  },
}

export const WithTabs: Story = {
  args: {
    title: 'Item Name',
    toolbarEnd: (
      <div className="flex items-center">
        <a
          href="#info"
          className="px-3 py-4 -mb-[2px] border-b-2 border-foreground-muted hover:bg-background-surface transition-colors"
          aria-label="Info tab"
        >
          Info
        </a>
        <a
          href="#tags"
          className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
          aria-label="Tags tab"
        >
          Tags
        </a>
        <a
          href="#vendors"
          className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
          aria-label="Vendors tab"
        >
          Vendors
        </a>
      </div>
    ),
    children: <div className="p-4">Tab content area</div>,
  },
}

export const WithScrollableContent: Story = {
  args: {
    title: 'Long Page',
    children: (
      <div className="p-4">
        {Array.from({ length: 40 }, (_, i) => {
          const label = `Item ${i + 1}`
          return (
            <div key={label} className="py-2 border-b border-accessory-default">
              {label}
            </div>
          )
        })}
      </div>
    ),
  },
}
