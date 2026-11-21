import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { screen, userEvent } from 'storybook/test'
import {
  MyHouseholdsDocument,
  type MyHouseholdsQuery,
  SetActiveHouseholdDocument,
} from '@/generated/graphql'
import { HouseholdSwitcher } from '.'

// The REAL switcher (households H7 task L.4). It reads `data-mode` from
// localStorage, so the meta sets cloud mode in `beforeEach`. `myHouseholds`
// and `setActiveHousehold` are answered by `MockedProvider`. No story lets a
// switch or a create finish: both end in a page load. What happens then is
// tested in `HouseholdSwitcher.test.tsx` and `hooks/useMyHouseholds.test.tsx`.
// Fixtures stay module-local: CSF turns every named export into a story.

type Choice = MyHouseholdsQuery['myHouseholds'][number]
type Mocks = NonNullable<MockedProviderProps['mocks']>

function choice(
  id: string,
  name: string,
  role: Choice['role'],
  isActive: boolean,
): Choice {
  return { __typename: 'HouseholdChoice', id, name, role, isActive }
}

// Lower case on purpose: names are shown as stored, never capitalized.
const lin = choice('hh-lin', 'the Lin home', 'owner', true)
const chen = choice('hh-chen', 'Chen flat', 'member', false)
const long = choice(
  'hh-long',
  'The Lin family household on Roosevelt Road, second floor, back door',
  'manager',
  false,
)

function listMock(households: Choice[]): Mocks[number] {
  return {
    request: { query: MyHouseholdsDocument },
    result: { data: { myHouseholds: households } },
    maxUsageCount: Number.POSITIVE_INFINITY,
  }
}

function withMocks(mocks: Mocks) {
  return [
    (Story: () => React.ReactElement) => (
      <MockedProvider mocks={mocks}>
        {/* The 224px column of the desktop sidebar */}
        <div className="w-56 p-2 bg-background-surface">
          <Story />
        </div>
      </MockedProvider>
    ),
  ]
}

async function openMenu() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Switch to…/ }))
  return user
}

const meta: Meta<typeof HouseholdSwitcher> = {
  title: 'Components/Household/HouseholdSwitcher',
  component: HouseholdSwitcher,
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}

export default meta
type Story = StoryObj<typeof HouseholdSwitcher>

/** One household is still a list: that household and Create new. */
export const OneHousehold: Story = {
  decorators: withMocks([listMock([lin])]),
  play: async () => {
    await openMenu()
    await screen.findByRole('menuitemradio', { name: /the Lin home/ })
  },
}

/** Two households. The current one is checked. */
export const TwoHouseholds: Story = {
  decorators: withMocks([listMock([lin, chen])]),
  play: async () => {
    await openMenu()
    await screen.findByRole('menuitemradio', { name: /Chen flat/ })
  },
}

/** A long name wraps inside the menu instead of widening it. */
export const LongName: Story = {
  decorators: withMocks([listMock([lin, long])]),
  play: async () => {
    await openMenu()
    await screen.findByRole('menuitemradio', { name: /Roosevelt Road/ })
  },
}

/** The list has not arrived yet. */
export const Loading: Story = {
  decorators: withMocks([
    {
      request: { query: MyHouseholdsDocument },
      result: { data: { myHouseholds: [lin] } },
      delay: Number.POSITIVE_INFINITY,
    },
  ]),
  play: async () => {
    await openMenu()
    await screen.findByText('Loading households…')
  },
}

/** The list cannot be read. Create new still works. */
export const LoadError: Story = {
  decorators: withMocks([
    {
      request: { query: MyHouseholdsDocument },
      error: new Error('Network error'),
    },
  ]),
  play: async () => {
    await openMenu()
    await screen.findByText('Could not load your households.')
  },
}

/** A switch is running: every row is disabled, the chosen one spins. */
export const Switching: Story = {
  decorators: withMocks([
    listMock([lin, chen]),
    {
      request: {
        query: SetActiveHouseholdDocument,
        variables: { householdId: 'hh-chen' },
      },
      result: {
        data: {
          setActiveHousehold: {
            __typename: 'Household',
            id: 'hh-chen',
            name: 'Chen flat',
            role: 'member',
          },
        },
      },
      // Never answers, so the page never loads the other household
      delay: Number.POSITIVE_INFINITY,
    },
  ]),
  play: async () => {
    const user = await openMenu()
    await user.click(
      await screen.findByRole('menuitemradio', { name: /Chen flat/ }),
    )
  },
}

/** Create new opens the dialog, with focus on the name field. */
export const CreateDialogOpen: Story = {
  decorators: withMocks([listMock([lin, chen])]),
  play: async () => {
    const user = await openMenu()
    await user.click(
      await screen.findByRole('menuitem', { name: 'Create new' }),
    )
    await screen.findByRole('dialog', { name: 'Create a new household' })
  },
}

/** The mobile /settings accordion's card, closed. */
export const Card: Story = {
  args: { variant: 'card' },
  decorators: [
    (Story) => (
      <MockedProvider mocks={[listMock([lin, chen])]}>
        <div className="max-w-md">
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
}
