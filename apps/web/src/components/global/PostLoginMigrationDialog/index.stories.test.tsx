import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as stories from './index.stories'

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
