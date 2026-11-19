import type { MockedProviderProps } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { HouseholdActivityDocument } from '@/generated/graphql'
import { ACTIVITY_PAGE_SIZE } from '@/hooks/useHouseholdActivity'
import { everyActivityAction } from '@/test/activityFixtures'
import { CloudRolePage, cloudRoleStorySetup } from '@/test/cloudRoleStory'

// The REAL Activity page (households H6, task J.6), in cloud mode, with the
// real `useHouseholdActivity` hook. The role reaches the page through
// `GetHousehold` (`CloudRolePage`); this file answers `HouseholdActivity`.

const meta = {
  title: 'Pages/Settings/Household/Activity',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const PATH = '/settings/household/activity'

type Answer = NonNullable<
  NonNullable<MockedProviderProps['mocks']>[number]['result']
>

function activityMock(
  result: Answer,
  delay?: number,
): NonNullable<MockedProviderProps['mocks']> {
  return [
    {
      request: {
        query: HouseholdActivityDocument,
        variables: { first: ACTIVITY_PAGE_SIZE },
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
      ...(delay === undefined ? {} : { delay }),
      result,
    },
  ]
}

/** The owner, with one row of each of the 19 actions. */
export const Owner: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="owner"
      mocks={activityMock({
        data: { householdActivity: everyActivityAction() },
      })}
    />
  ),
}

/** A manager with an empty log. */
export const Empty: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="manager"
      mocks={activityMock({ data: { householdActivity: [] } })}
    />
  ),
}

/** The first page has not come back yet. */
export const Loading: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="owner"
      mocks={activityMock(
        { data: { householdActivity: [] } },
        Number.POSITIVE_INFINITY,
      )}
    />
  ),
}

/** A household member opened the URL: the server answers FORBIDDEN. */
export const NoAccess: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="member"
      mocks={activityMock({
        errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
      })}
    />
  ),
}

/** The read failed with no code: Retry. */
export const LoadError: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="owner"
      mocks={activityMock({ errors: [{ message: 'down' }] })}
    />
  ),
}
