import type { Meta, StoryObj } from '@storybook/react'
import { ReadOnlyNote } from '.'

const meta = {
  title: 'Components/Shared/ReadOnlyNote',
  component: ReadOnlyNote,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ReadOnlyNote>

export default meta
type Story = StoryObj<typeof meta>

// What a household member sees above a catalog list.
export const Default: Story = {}

// The same line with a page's own text.
export const CustomText: Story = {
  args: {
    text: 'Only a household owner or manager can change this item.',
  },
}

// With an id, so a disabled control can name it in `aria-describedby`
// (a location viewer's cart and cooking checkboxes).
export const WithId: Story = {
  args: {
    id: 'location-view-only-note',
    text: 'You can view this location, but not change it.',
  },
}
