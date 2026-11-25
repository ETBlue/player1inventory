import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import type { ConsumableFilter } from '@/lib/filterUtils'
import type { Item } from '@/types'
import { ConsumableFilterDropdown } from '.'

function item(id: string, consumable: boolean): Item {
  return {
    id,
    name: id,
    tagIds: [],
    targetUnit: 'package',
    consumeAmount: 1,
    consumable,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

const items = [
  item('Tissue', true),
  item('Milk', true),
  item('Cups', false),
  item('Slippers', false),
  item('Rice', true),
]

function Interactive({ initial }: { initial: ConsumableFilter }) {
  const [value, setValue] = useState<ConsumableFilter>(initial)
  return (
    <ConsumableFilterDropdown value={value} onChange={setValue} items={items} />
  )
}

const meta: Meta<typeof Interactive> = {
  title: 'Components/Item/ConsumableFilterDropdown',
  component: Interactive,
}

export default meta
type Story = StoryObj<typeof Interactive>

export const All: Story = { args: { initial: 'all' } }

export const NotConsumable: Story = { args: { initial: 'notConsumable' } }
