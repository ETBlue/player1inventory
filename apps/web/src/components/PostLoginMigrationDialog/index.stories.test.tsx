import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Idle, Prompting } = composeStories(stories)

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

    it('renders without error — shows loading while db initializes', () => {
      render(<Prompting />)
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })
})
