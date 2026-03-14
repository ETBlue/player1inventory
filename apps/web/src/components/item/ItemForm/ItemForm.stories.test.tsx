import { composeStories } from '@storybook/react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemForm.stories'

const { CreateMode, EditMode, EditMeasurementMode, EditValidationError } =
  composeStories(stories)

describe('ItemForm stories smoke tests', () => {
  it('CreateMode renders without error', async () => {
    const { container } = render(<CreateMode />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('EditMode renders without error', async () => {
    const { container } = render(<EditMode />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('EditMeasurementMode renders without error', async () => {
    const { container } = render(<EditMeasurementMode />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('EditValidationError renders without error', async () => {
    const { container } = render(<EditValidationError />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })
})
