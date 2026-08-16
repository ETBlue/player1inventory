import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import type { Location } from '@/types'
import { LocationPager } from './LocationPager'

// The dot states are CSS — no test can judge them, so these stories exist to be
// looked at, in BOTH themes. What to check:
//   • the viewed dot is visibly larger AND a different colour (dark mode has
//     almost no luminance difference between the two fills, so size carries it)
//   • the active location's dot is hollow — a shape difference that survives
//     greyscale, unlike the halo ring this replaced
//   • the caption under the name always says which location is active
const meta = {
  title: 'Components/Item/LocationPager',
  component: LocationPager,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LocationPager>

export default meta
type Story = StoryObj<typeof meta>

const makeLocations = (names: string[]): Location[] =>
  names.map((name, order) => ({
    id: `loc-${order}`,
    name,
    order,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }))

const threeLocations = makeLocations(['My Home', 'Cabin', 'Office'])

function PagerHarness({
  locations,
  startIndex = 0,
  activeLocationId = 'loc-0',
}: {
  locations: Location[]
  startIndex?: number
  activeLocationId?: string
}) {
  const [index, setIndex] = useState(startIndex)
  return (
    <div className="bg-background-elevated p-6">
      <LocationPager
        locations={locations}
        currentIndex={index}
        activeLocationId={activeLocationId}
        onChange={setIndex}
        panelId="story-panel"
        tabIdPrefix="story-tab"
      />
      <div id="story-panel" role="tabpanel" className="sr-only">
        stock form goes here
      </div>
    </div>
  )
}

export const OnTheActiveLocation: Story = {
  name: 'Viewing the active location',
  args: {} as never,
  render: () => <PagerHarness locations={threeLocations} />,
}

export const ViewingAnotherLocation: Story = {
  name: 'Viewing another location — active stays marked',
  args: {} as never,
  render: () => <PagerHarness locations={threeLocations} startIndex={1} />,
}

export const OnTheLastLocation: Story = {
  name: 'Last page — next chevron disabled',
  args: {} as never,
  render: () => <PagerHarness locations={threeLocations} startIndex={2} />,
}

export const ManyLocations: Story = {
  name: 'Many locations',
  args: {} as never,
  render: () => (
    <PagerHarness
      locations={makeLocations([
        'My Home',
        'Cabin',
        'Office',
        'Parents',
        'Storage unit',
        'Boat',
      ])}
      startIndex={3}
    />
  ),
}

export const LongLocationName: Story = {
  name: 'Long location name truncates',
  args: {} as never,
  render: () => (
    <div className="w-64">
      <PagerHarness
        locations={makeLocations([
          'My Home',
          'The rather long name of a storage unit across town',
        ])}
        startIndex={1}
      />
    </div>
  ),
}
