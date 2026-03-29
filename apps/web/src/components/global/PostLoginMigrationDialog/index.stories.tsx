import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useState } from 'react'
import { db } from '@/db'
import { PostLoginMigrationDialog } from '.'

// PostLoginMigrationDialog uses:
//   - usePostLoginMigration() → useAuth() from @clerk/react
//     (mocked in Storybook via .storybook/mocks/clerk.tsx — always returns isSignedIn: true)
//   - getAllItems() from db — async Dexie call
//
// Idle story: set 'migration-prompted' in localStorage so the hook returns early.
//   No db access occurs. Dialog stays closed.
//
// Prompting story: seed db with one item and clear 'migration-prompted'.
//   The hook finds local items → sets state to 'prompting' → dialog opens.

const meta: Meta<typeof PostLoginMigrationDialog> = {
  title: 'Components/Global/PostLoginMigrationDialog',
  component: PostLoginMigrationDialog,
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof PostLoginMigrationDialog>

// Story 1: Idle — migration already prompted, dialog stays hidden
export const Idle: Story = {
  name: 'Idle — already prompted, dialog hidden',
  beforeEach() {
    localStorage.setItem('migration-prompted', '1')
    return () => localStorage.removeItem('migration-prompted')
  },
}

// Story 2: Prompting — user has local data, dialog asks to import
function PromptingStory() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      await db.items.add({
        id: 'story-item-1',
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      localStorage.removeItem('migration-prompted')
      setReady(true)
    }
    init()
  }, [])

  if (!ready) return <div>Loading...</div>

  return <PostLoginMigrationDialog />
}

export const Prompting: Story = {
  name: 'Prompting — local data found, import dialog open',
  render: () => <PromptingStory />,
}
