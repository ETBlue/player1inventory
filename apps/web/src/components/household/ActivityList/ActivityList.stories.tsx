import type { Meta, StoryObj } from '@storybook/react'
import { activityEntry, everyActivityAction } from '@/test/activityFixtures'
import { ActivityList } from './ActivityList'

const meta = {
  title: 'Components/Household/ActivityList',
  component: ActivityList,
} satisfies Meta<typeof ActivityList>

export default meta
type Story = StoryObj<typeof meta>

/** One row of each of the 19 actions, newest first. */
export const EveryAction: Story = {
  args: { entries: everyActivityAction() },
}

/** A person who deleted their account: the stored name and "(deleted account)". */
export const DeletedAccount: Story = {
  args: {
    entries: [
      activityEntry('d1', 'MEMBER_LEFT', {
        actorName: 'Ben',
        actorDeleted: true,
      }),
    ],
  },
}

/** Rows whose stored details had the wrong shape: each still a sentence. */
export const MissingFields: Story = {
  args: {
    entries: [
      activityEntry('n1', 'LOCATION_ROLE_SET', { toRole: null }),
      activityEntry('n2', 'LOCATIONS_DELETED', { count: null }),
      activityEntry('n3', 'MEMBER_LEFT', { actorName: '' }),
    ],
  },
}

/** An empty log. */
export const Empty: Story = {
  args: { entries: [] },
}
