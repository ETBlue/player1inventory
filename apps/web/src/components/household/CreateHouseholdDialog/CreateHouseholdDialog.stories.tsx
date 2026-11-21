import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { fn, screen, userEvent } from 'storybook/test'
import { CreateHouseholdDocument } from '@/generated/graphql'
import { CreateHouseholdDialog } from '.'

// The REAL dialog (households H7 task L.4). `MockedProvider` answers
// `createHousehold`. No story lets a create succeed: that ends in a page
// load into the new household. `Creating` never answers; `ServerError`
// answers with an error. The rest is tested in `CreateHouseholdDialog.test.tsx`.
// Fixtures stay module-local: CSF turns every named export into a story.

type Mocks = NonNullable<MockedProviderProps['mocks']>

function createMock(rest: Partial<Mocks[number]>): Mocks[number] {
  return {
    request: {
      query: CreateHouseholdDocument,
      variables: { name: 'Beach house', alsoWhenMember: true },
    },
    ...rest,
  }
}

function withMocks(mocks: Mocks) {
  return [
    (Story: () => React.ReactElement) => (
      <MockedProvider mocks={mocks}>
        <Story />
      </MockedProvider>
    ),
  ]
}

async function typeAndCreate() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Household name'), 'Beach house')
  await user.click(screen.getByRole('button', { name: 'Create' }))
}

const meta: Meta<typeof CreateHouseholdDialog> = {
  title: 'Components/Household/CreateHouseholdDialog',
  component: CreateHouseholdDialog,
  args: { open: true, onOpenChange: fn() },
}

export default meta
type Story = StoryObj<typeof CreateHouseholdDialog>

/** Open, with the name field empty (the server's default name). */
export const Open: Story = {
  decorators: withMocks([]),
}

/** The create is running: Create spins and both buttons are off. */
export const Creating: Story = {
  decorators: withMocks([
    createMock({
      result: {
        data: {
          createHousehold: {
            __typename: 'Household',
            id: 'hh-beach',
            name: 'Beach house',
            role: 'owner',
          },
        },
      },
      delay: Number.POSITIVE_INFINITY,
    }),
  ]),
  play: typeAndCreate,
}

/** The server failed. The error shows in the dialog, which stays open. */
export const ServerError: Story = {
  decorators: withMocks([createMock({ error: new Error('Network error') })]),
  play: typeAndCreate,
}
