import type { Meta, StoryObj } from '@storybook/react'
import { Info, Store, Tags } from 'lucide-react'
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

// The `tabs` prop: a second row under the toolbar, as the item page uses it
// (routes/items/$id.tsx). Below `sm` only the icons show; the names stay as
// visually hidden text.
const storyTab =
  'flex-1 flex items-center justify-center gap-2 px-2 py-3 -mb-[2px] border-b-2 text-sm hover:bg-background-base transition-colors'

export const WithTabs: Story = {
  args: {
    title: 'Item Name',
    tabs: (
      <nav
        aria-label="Sections"
        className="flex w-[100cqw] border-b-2 border-accessory-default bg-background-surface"
      >
        <a
          href="#info"
          aria-current="page"
          className={`${storyTab} border-foreground-muted`}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Info</span>
        </a>
        <a href="#tags" className={`${storyTab} border-accessory-default`}>
          <Tags className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Tags</span>
        </a>
        <a href="#vendors" className={`${storyTab} border-accessory-default`}>
          <Store className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Vendors</span>
        </a>
      </nav>
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
