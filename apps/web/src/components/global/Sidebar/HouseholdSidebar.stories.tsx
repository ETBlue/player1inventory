import type { Meta, StoryObj } from '@storybook/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { HouseholdSidebar } from './HouseholdSidebar'

const meta = {
  title: 'Components/Global/Sidebar/HouseholdSidebar',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// The household view on its own, in the same 224px column `Sidebar` gives it.
// It is rendered directly rather than through `Sidebar`, so the story shows it
// at any canvas width (`Sidebar` shows it only on desktop).
function HouseholdSidebarStory({ path }: { path: string }) {
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
  return <RouterProvider router={router} />
}

// On the config page: General is active
export const General: Story = {
  render: () => <HouseholdSidebarStory path="/settings/household" />,
}

// On the tags list: Tags is active
export const TagsActive: Story = {
  render: () => <HouseholdSidebarStory path="/settings/household/tags" />,
}
