import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithInfoFields } = composeStories(stories)

describe('Item detail info tab stories smoke tests', () => {
  it('Default renders the Name info field after setup', async () => {
    render(<Default />)
    // Info tab renders the name input; stock fields are no longer here.
    expect(await screen.findByLabelText(/^name$/i)).toBeInTheDocument()
  })

  it('WithInfoFields renders the Wikidata URL info field after setup', async () => {
    render(<WithInfoFields />)
    expect(
      await screen.findByDisplayValue('https://www.wikidata.org/wiki/Q8495'),
    ).toBeInTheDocument()
  })
})
