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
