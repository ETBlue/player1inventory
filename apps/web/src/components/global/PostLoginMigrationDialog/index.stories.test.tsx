import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stories from './index.stories'

// Freeze fetchLocalPayload on a never-resolving promise so the 'auto-importing'
// state stays mounted long enough to assert. Without this, the hook's async
// chain (fetchLocalPayload → importCloudData → 'done') settles in a single tick
// — fetchLocalPayload rejects against the empty test DB and the .catch jumps the
// hook straight to 'done', closing the progress dialog before findByText can
// observe it. Idle returns early (migration-prompted set) and Prompting calls
// getAllItems (not fetchLocalPayload), so neither is affected.
vi.mock('@/lib/exportData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exportData')>()
  return {
    ...actual,
    fetchLocalPayload: vi.fn(() => new Promise(() => {})),
  }
})

const { Idle, Prompting, AutoImporting } = composeStories(stories)

describe('PostLoginMigrationDialog stories smoke tests', () => {
  describe('Idle', () => {
    beforeEach(() => localStorage.setItem('migration-prompted', '1'))
    afterEach(() => localStorage.removeItem('migration-prompted'))

    it('renders without error — dialog stays hidden', () => {
      const { container } = render(<Idle />)
      expect(container).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
  })

  describe('Prompting', () => {
    afterEach(() => localStorage.removeItem('migration-prompted'))

    it('renders without error — dialog title visible once db is ready', async () => {
      render(<Prompting />)
      expect(
        await screen.findByText('Import local data to cloud?'),
      ).toBeInTheDocument()
    })
  })

  describe('AutoImporting', () => {
    beforeEach(() => {
      localStorage.setItem('migration-strategy', 'skip')
      localStorage.removeItem('migration-prompted')
    })
    afterEach(() => {
      localStorage.removeItem('migration-strategy')
      localStorage.removeItem('migration-prompted')
    })

    it('renders without error — auto-import progress dialog shown', async () => {
      render(<AutoImporting />)
      expect(
        await screen.findByText('Copying local data to cloud…'),
      ).toBeInTheDocument()
    })
  })
})
