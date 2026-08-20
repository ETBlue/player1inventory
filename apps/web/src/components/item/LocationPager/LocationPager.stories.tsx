import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import type { Location } from '@/types'
import { LocationPager } from './LocationPager'

// The dot states are CSS — no test can judge them, so these stories exist to be
// looked at, in BOTH themes. What to check:
//   • every dot is the same size and the same colour (`foreground-muted`);
//     only the viewed one is filled and the rest are hollow rings
//   • the fill lands on the page you are looking at — and on nothing else.
//     The dots say nothing about which location is globally active
//   • which is why the caption under the name always names the active
//     location: it is the only sighted cue for that fact
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
  name: 'Viewing another location — caption names the active one',
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
