import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TopBarSaveButton.stories'

const { Dirty, Clean, Saving } = composeStories(stories)

describe('TopBarSaveButton stories smoke tests', () => {
  it('Dirty renders an enabled Save in the top bar', async () => {
    render(<Dirty />)
    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('Clean renders a disabled Save', async () => {
    render(<Clean />)
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Saving renders a disabled Save', async () => {
    render(<Saving />)
    expect(await screen.findByRole('button', { name: /save/i })).toBeDisabled()
  })
})
