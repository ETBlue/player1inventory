import type { Meta, StoryObj } from '@storybook/react'
import { screen, userEvent } from 'storybook/test'
import type { FilterAxis } from '@/lib/shelfUtils'
import { ShelfFilterPicksDialog } from './ShelfFilterPicksDialog'

const meta: Meta<typeof ShelfFilterPicksDialog> = {
  title: 'Components/Shelf/ShelfFilterPicksDialog',
  component: ShelfFilterPicksDialog,
}

export default meta
type Story = StoryObj<typeof ShelfFilterPicksDialog>

const vendorAxis: FilterAxis = {
  key: 'vendor',
  kind: 'vendor',
  options: [{ id: 'v1', name: 'Costco' }],
}

const categoryAxis: FilterAxis = {
  key: 'tt-cat',
  kind: 'tag',
  typeName: 'Category',
  options: [
    { id: 'dairy', name: 'Dairy' },
    { id: 'frozen', name: 'Frozen' },
  ],
}

const storageMetAxis: FilterAxis = {
  key: 'tt-sto',
  kind: 'tag',
  typeName: 'Storage',
  options: [{ id: 'fridge', name: 'Fridge' }],
  metBy: 'fridge',
}

const multiVendorAxis: FilterAxis = {
  key: 'vendor',
  kind: 'vendor',
  options: [
    { id: 'v1', name: 'Costco' },
    { id: 'v2', name: '7-Eleven' },
  ],
}

const recipeAxis: FilterAxis = {
  key: 'recipe',
  kind: 'recipe',
  options: [
    { id: 'r1', name: 'Pancakes' },
    { id: 'r2', name: 'Waffles' },
  ],
}

export const SingleOpenAxis: Story = {
  args: {
    open: true,
    itemName: 'Oat Milk',
    shelfName: 'Costco Runs',
    axes: [vendorAxis],
    onOpenChange: () => {},
    onConfirm: async () => {},
  },
}

export const ThreeOpenAxes: Story = {
  args: {
    open: true,
    itemName: 'Oat Milk',
    shelfName: 'Breakfast Supplies',
    axes: [categoryAxis, multiVendorAxis, recipeAxis],
    onOpenChange: () => {},
    onConfirm: async () => {},
  },
}

export const SomeAlreadyMet: Story = {
  args: {
    open: true,
    itemName: 'Oat Milk',
    shelfName: 'Dairy',
    axes: [storageMetAxis, categoryAxis],
    onOpenChange: () => {},
    onConfirm: async () => {},
  },
}

export const WriteFailed: Story = {
  args: {
    open: true,
    itemName: 'Oat Milk',
    shelfName: 'Dairy',
    axes: [categoryAxis],
    onOpenChange: () => {},
    onConfirm: async () => {
      throw new Error('boom')
    },
  },
  // Picks an axis option and submits, so the rejected onConfirm's inline
  // error is visible without a viewer having to interact by hand. The
  // dialog portals to document.body, so this queries the whole `screen`
  // rather than a `within(canvasElement)` scope that would never see it.
  play: async () => {
    const user = userEvent.setup()

    await user.click(await screen.findByRole('radio', { name: 'Frozen' }))
    await user.click(await screen.findByRole('button', { name: /add/i }))

    await screen.findByText(/couldn't add to this shelf/i)
  },
}
