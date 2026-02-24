import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import type { SortDirection, SortField } from '@/lib/sortUtils'
import { SortFilterToolbar } from './SortFilterToolbar'

const meta: Meta<typeof SortFilterToolbar> = {
  title: 'Components/SortFilterToolbar',
  component: SortFilterToolbar,
}

export default meta
type Story = StoryObj<typeof SortFilterToolbar>

function Controlled() {
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [tagsVisible, setTagsVisible] = useState(false)

  return (
    <SortFilterToolbar
      filtersVisible={filtersVisible}
      tagsVisible={tagsVisible}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onToggleFilters={() => setFiltersVisible((v) => !v)}
      onToggleTags={() => setTagsVisible((v) => !v)}
      onSortChange={(field, dir) => {
        setSortBy(field)
        setSortDirection(dir)
      }}
    />
  )
}

export const Default: Story = {
  render: () => <Controlled />,
}

function ControlledWith(props: {
  filtersVisible?: boolean
  tagsVisible?: boolean
  sortBy?: SortField
  sortDirection?: SortDirection
}) {
  const [sortBy, setSortBy] = useState<SortField>(props.sortBy ?? 'name')
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    props.sortDirection ?? 'asc',
  )
  const [filtersVisible, setFiltersVisible] = useState(
    props.filtersVisible ?? false,
  )
  const [tagsVisible, setTagsVisible] = useState(props.tagsVisible ?? false)

  return (
    <SortFilterToolbar
      filtersVisible={filtersVisible}
      tagsVisible={tagsVisible}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onToggleFilters={() => setFiltersVisible((v) => !v)}
      onToggleTags={() => setTagsVisible((v) => !v)}
      onSortChange={(field, dir) => {
        setSortBy(field)
        setSortDirection(dir)
      }}
    />
  )
}

export const FiltersActive: Story = {
  render: () => (
    <ControlledWith filtersVisible={true} sortBy="name" sortDirection="asc" />
  ),
}

export const TagsActive: Story = {
  render: () => (
    <ControlledWith tagsVisible={true} sortBy="name" sortDirection="asc" />
  ),
}

export const SortedByStock: Story = {
  render: () => <ControlledWith sortBy="stock" sortDirection="asc" />,
}

export const Descending: Story = {
  render: () => <ControlledWith sortBy="name" sortDirection="desc" />,
}
