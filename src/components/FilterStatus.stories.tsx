import type { Meta, StoryObj } from '@storybook/react'
import { FilterStatus } from './FilterStatus'

const meta = {
  title: 'Components/FilterStatus',
  component: FilterStatus,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClearAll: () => console.log('Clear all filters'),
  },
} satisfies Meta<typeof FilterStatus>

export default meta
type Story = StoryObj<typeof meta>

export const WithActiveFilters: Story = {
  args: {
    filteredCount: 5,
    totalCount: 10,
    hasActiveFilters: true,
  },
}

export const NoActiveFilters: Story = {
  args: {
    filteredCount: 10,
    totalCount: 10,
    hasActiveFilters: false,
  },
}

export const AllFiltered: Story = {
  args: {
    filteredCount: 0,
    totalCount: 10,
    hasActiveFilters: true,
  },
}

export const EmptyList: Story = {
  args: {
    filteredCount: 0,
    totalCount: 0,
    hasActiveFilters: false,
  },
}
