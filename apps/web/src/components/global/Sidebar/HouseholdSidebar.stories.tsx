import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { GetHouseholdDocument } from '@/generated/graphql'
import { HouseholdSidebar } from './HouseholdSidebar'

const meta = {
  title: 'Components/Global/Sidebar/HouseholdSidebar',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// A long household name, to show that the heading wraps inside the 224px
// column. Module-local: CSF turns every named export into a story.
const cloudMocks: NonNullable<MockedProviderProps['mocks']> = [
  {
    request: { query: GetHouseholdDocument },
    result: {
      data: {
        household: {
          __typename: 'Household',
          id: 'household-1',
          name: 'The Lin family household on Roosevelt Road',
          role: 'owner',
        },
      },
    },
    maxUsageCount: Number.POSITIVE_INFINITY,
  },
]

// The household view on its own, in the same 224px column `Sidebar` gives it.
// It is rendered directly rather than through `Sidebar`, so the story shows it
// at any canvas width (`Sidebar` shows it only on desktop).
//
// The heading is `HouseholdLabel`, which calls an Apollo hook in both modes
// (skipped in local), so every story needs a `MockedProvider`.
function HouseholdSidebarStory({
  path,
  mocks = [],
}: {
  path: string
  mocks?: NonNullable<MockedProviderProps['mocks']>
}) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({
        component: () => (
          <nav
            aria-label="Sidebar navigation"
            className="flex flex-col w-56 min-h-dvh bg-background-surface border-r border-accessory-default"
          >
            <HouseholdSidebar />
          </nav>
        ),
      }),
      history: createMemoryHistory({ initialEntries: [path] }),
    }),
  )
  return (
    <MockedProvider mocks={mocks}>
      <RouterProvider router={router} />
    </MockedProvider>
  )
}

// On the config page: General is active. Local mode: the heading is "My data".
export const General: Story = {
  render: () => <HouseholdSidebarStory path="/settings/household" />,
}

// On the tags list: Tags is active
export const TagsActive: Story = {
  render: () => <HouseholdSidebarStory path="/settings/household/tags" />,
}

// Cloud mode: the heading is the household's name, and a long name wraps
export const CloudHouseholdName: Story = {
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
  render: () => (
    <HouseholdSidebarStory path="/settings/household" mocks={cloudMocks} />
  ),
}
