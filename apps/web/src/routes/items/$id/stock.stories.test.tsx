import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './stock.stories'

const { PackageItem, MeasurementItem } = composeStories(stories)

describe('Item detail stock tab stories smoke tests', () => {
  it('PackageItem renders the Target Quantity stock field after setup', async () => {
    render(<PackageItem />)
    expect(await screen.findByLabelText(/target quantity/i)).toBeInTheDocument()
  })

  it('MeasurementItem renders the Packed stock field after setup', async () => {
    render(<MeasurementItem />)
    expect(await screen.findByLabelText(/^packed/i)).toBeInTheDocument()
  })
})
