import type { Meta, StoryObj } from '@storybook/react'
import { ArrowUpFromLine, Plus } from 'lucide-react'
import type { PantryItem } from '@/types'
import { ItemSearchTail } from './ItemSearchTail'

const baseStock = {
  targetUnit: 'package' as const,
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
  consumeAmount: 1,
  tagIds: [],
  vendorIds: [],
  locationId: 'local',
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
}

// Stocked here (has a stockId) but not in the page's list.
const bread = {
  id: 'bread',
  name: 'Bread',
  stockId: 'stock-bread',
  ...baseStock,
} as PantryItem

// Exist globally, stocked only at another location — no stockId.
const milkPowder = {
  id: 'milk-powder',
  name: 'Milk Powder',
  stockId: undefined,
  ...baseStock,
} as PantryItem
const oatMilk = {
  id: 'oat-milk',
  name: 'Oat Milk',
  stockId: undefined,
  ...baseStock,
} as PantryItem

const renderItem = (item: PantryItem) => (
  <div className="px-3 py-2 text-sm capitalize">{item.name}</div>
)

const meta: Meta<typeof ItemSearchTail> = {
  title: 'Components/Item/ItemSearchTail',
  component: ItemSearchTail,
  parameters: { layout: 'padded' },
  args: { renderItem },
}

export default meta
type Story = StoryObj<typeof ItemSearchTail>

// The full three-section picture: the page's own list sits above (not rendered
// by this component), then "not in this list", then "not stocked here".
export const BothSections: Story = {
  args: {
    inLocationItems: [bread],
    notStockedHereItems: [milkPowder, oatMilk],
    groupAction: {
      label: 'Apply Costco',
      onAction: () => {},
      icon: <ArrowUpFromLine />,
    },
    addToLocationAction: {
      label: 'Add to My Home',
      onAction: () => {},
      icon: <Plus />,
    },
  },
}

// Cloud mode: no ItemStock backend, so no add-to-location action exists.
export const InLocationOnly: Story = {
  args: {
    inLocationItems: [bread],
    notStockedHereItems: [milkPowder, oatMilk],
    groupAction: { label: 'Apply Costco', onAction: () => {} },
  },
}

// The no-vendor cart: the group cannot be joined by a press (that would mean
// stripping every vendor from the item), so the row explains itself instead.
export const GroupNote: Story = {
  args: {
    inLocationItems: [bread],
    notStockedHereItems: [milkPowder, oatMilk],
    groupNote: () => <span className="normal-case">In Costco</span>,
    addToLocationAction: { label: 'Add to My Home', onAction: () => {} },
  },
}

// Neither a group action nor a note: section 2 is suppressed entirely.
export const NotStockedHereOnly: Story = {
  args: {
    inLocationItems: [bread],
    notStockedHereItems: [milkPowder, oatMilk],
    addToLocationAction: { label: 'Add to My Home', onAction: () => {} },
  },
}

// A stock mutation in flight: the clicked row spins, its siblings disable.
export const Pending: Story = {
  args: {
    inLocationItems: [],
    notStockedHereItems: [milkPowder, oatMilk],
    addToLocationAction: {
      label: 'Add to My Home',
      onAction: () => {},
      pendingItemId: 'milk-powder',
    },
  },
}
