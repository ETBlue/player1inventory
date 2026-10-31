import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { UserSidebar } from './UserSidebar'

// The user view on its own, in the same 224px column `Sidebar` gives it. It is
// rendered directly rather than through `Sidebar`, so the story shows it at
// any canvas width (`Sidebar` shows it only on desktop, after the 👤 button
// is pressed). It needs no router: it has no links.
const meta: Meta<typeof UserSidebar> = {
  title: 'Components/Global/Sidebar/UserSidebar',
  component: UserSidebar,
  args: { onBack: fn() },
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]}>
        <nav
          aria-label="Sidebar navigation"
          className="flex flex-col w-56 min-h-dvh bg-background-surface border-r border-accessory-default"
        >
          <Story />
        </nav>
      </MockedProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof UserSidebar>

// Local mode: the heading says Preferences, and there is no account card
export const LocalMode: Story = {
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}

// Cloud mode: the heading is the user's name, and the account card leads
export const CloudMode: Story = {
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}
