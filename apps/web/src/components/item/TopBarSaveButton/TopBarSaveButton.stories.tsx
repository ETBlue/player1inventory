import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { TopBarSaveButton, type TopBarSaveButtonProps } from '.'

// A stand-in for the item page's top bar: a row with a title and the slot
// the button portals into, the way `routes/items/$id.tsx` renders it.
function InTopBar(props: Omit<TopBarSaveButtonProps, 'saveSlot'>) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <div className="flex max-w-sm items-center gap-2 border-b-2 border-accessory-default bg-background-surface p-2">
      <span className="flex-1 truncate font-medium">Milk</span>
      <div ref={setSlot} className="contents" />
      <TopBarSaveButton saveSlot={slot} {...props} />
    </div>
  )
}

const meta: Meta<typeof InTopBar> = {
  title: 'Components/Item/TopBarSaveButton',
  component: InTopBar,
  args: { onClick: () => {}, disabled: false, isLoading: false },
}

export default meta
type Story = StoryObj<typeof InTopBar>

/** A badge was pressed and not saved yet: Save is on. */
export const Dirty: Story = {}

/** Nothing changed: Save is off. */
export const Clean: Story = { args: { disabled: true } }

/** A Save is running. */
export const Saving: Story = { args: { disabled: true, isLoading: true } }
