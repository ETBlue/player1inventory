import type { Meta, StoryObj } from '@storybook/react'
import { StockProgressRow } from './StockProgressRow'

const meta: Meta<typeof StockProgressRow> = {
  title: 'Components/Item/StockProgressRow',
  component: StockProgressRow,
  args: {
    onClear: () => {},
    onFill: () => {},
    clearLabel: 'Clear',
    fillLabel: 'Fill to Full',
  },
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof StockProgressRow>

export const Ok: Story = {
  name: 'Ok — healthy stock',
  args: {
    quantityLabel: '3 / 4',
    unitLabel: 'pack',
    current: 3,
    target: 4,
    status: 'ok',
    targetUnit: 'package',
    packed: 3,
    unpacked: 0,
    clearDisabled: false,
    fillDisabled: false,
  },
}

export const Low: Story = {
  name: 'Warning — at or below refill threshold',
  args: {
    quantityLabel: '1 / 4',
    unitLabel: 'pack',
    current: 1,
    target: 4,
    status: 'warning',
    targetUnit: 'package',
    packed: 1,
    unpacked: 0,
    clearDisabled: false,
    fillDisabled: false,
  },
}

export const Inactive: Story = {
  name: 'Inactive — target is 0',
  args: {
    // current > 0 so ItemProgressBar's target=0 branch still renders a
    // status-tinted bar rather than the empty untinted one
    quantityLabel: '1 / 0',
    unitLabel: 'pack',
    current: 1,
    target: 0,
    status: 'inactive',
    targetUnit: 'package',
    packed: 1,
    unpacked: 0,
    clearDisabled: false,
    fillDisabled: true,
  },
}

export const MeasurementUnit: Story = {
  name: 'Measurement unit — dual-unit item',
  args: {
    quantityLabel: '1 (+0.5) / 2',
    unitLabel: 'L',
    current: 1.5,
    target: 2,
    status: 'ok',
    targetUnit: 'measurement',
    packed: 1,
    unpacked: 0.5,
    measurementUnit: 'L',
    amountPerPackage: 1,
    clearDisabled: false,
    fillDisabled: false,
  },
}
