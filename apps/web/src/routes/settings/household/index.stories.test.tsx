import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('Household config page stories smoke tests', () => {
  it('Default renders the title and the export card', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My data' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Download my data')).toBeInTheDocument()
  })
})
