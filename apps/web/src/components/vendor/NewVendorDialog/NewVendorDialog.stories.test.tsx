import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './NewVendorDialog.stories'

const { Default, WithoutSuccessCallback } = composeStories(stories)

describe('NewVendorDialog stories smoke tests', () => {
  it('Default renders the dialog with name input', () => {
    render(<Default />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('WithoutSuccessCallback renders the dialog', () => {
    render(<WithoutSuccessCallback />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
