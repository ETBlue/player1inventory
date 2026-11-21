import type { Meta, StoryObj } from '@storybook/react'
import { HOUSEHOLD_CHANGED_NOTICE_KEY } from '@/apollo/householdGuard'
import { HouseholdChangedNotice } from './HouseholdChangedNotice'

// Each story stores the message the way `recoverFromHouseholdChange` does,
// before the component mounts. The component reads it and removes it, so
// these stories show the real read, not a copy of the markup.
function storeNotice(value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(HOUSEHOLD_CHANGED_NOTICE_KEY)
    else sessionStorage.setItem(HOUSEHOLD_CHANGED_NOTICE_KEY, value)
  } catch {
    // Storage blocked: the story shows nothing.
  }
}

const meta = {
  title: 'Global/HouseholdChangedNotice',
  component: HouseholdChangedNotice,
} satisfies Meta<typeof HouseholdChangedNotice>

export default meta
type Story = StoryObj<typeof meta>

export const BothNames: Story = {
  decorators: [
    (Story) => {
      storeNotice(
        JSON.stringify({
          household: 'Chen flat',
          oldHousehold: 'The Lin home',
        }),
      )
      return <Story />
    },
  ],
}

export const OldNameUnknown: Story = {
  decorators: [
    (Story) => {
      storeNotice(
        JSON.stringify({ household: 'Chen flat', oldHousehold: null }),
      )
      return <Story />
    },
  ],
}

export const NoMessage: Story = {
  decorators: [
    (Story) => {
      storeNotice(null)
      return <Story />
    },
  ],
}
