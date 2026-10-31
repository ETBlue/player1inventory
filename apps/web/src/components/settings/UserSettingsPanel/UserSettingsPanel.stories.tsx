import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { UserSettingsPanel } from '.'

// The panel reads `data-mode` from localStorage, so each story sets it in
// `beforeEach`. In cloud mode it calls Clerk's `useUser()`; Storybook aliases
// `@clerk/react` to `.storybook/mocks/clerk.tsx`, whose user has a name, an
// email and both dates. DataModeCard's cloud section calls `useApolloClient()`,
// hence the MockedProvider.
const meta: Meta<typeof UserSettingsPanel> = {
  title: 'Components/Settings/UserSettingsPanel',
  component: UserSettingsPanel,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]}>
        <Story />
      </MockedProvider>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof UserSettingsPanel>

// Local mode: theme, language and data mode, no account details
export const LocalMode: Story = {
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}

// Cloud mode: the account card comes first
export const CloudMode: Story = {
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}

// Compact, in the 224px column the desktop user sidebar gives it
export const CompactCloudMode: Story = {
  args: { compact: true },
  decorators: [
    (Story) => (
      <div className="w-56 bg-background-surface">
        <Story />
      </div>
    ),
  ],
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}
