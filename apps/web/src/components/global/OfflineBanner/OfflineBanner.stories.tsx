import type { Meta, StoryObj } from '@storybook/react'
import { OfflineBanner } from './OfflineBanner'

const meta = {
  title: 'Global/OfflineBanner',
  component: OfflineBanner,
} satisfies Meta<typeof OfflineBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Online: Story = {
  args: { forceOffline: false },
}

export const OfflineRecent: Story = {
  args: {
    forceOffline: true,
    lastSyncedAt: new Date(Date.now() - 12 * 60 * 1000),
  },
}

export const OfflineStale: Story = {
  args: {
    forceOffline: true,
    lastSyncedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
}

export const OfflineNeverSynced: Story = {
  args: { forceOffline: true, lastSyncedAt: null },
}
