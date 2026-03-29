import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './onboarding.stories'

const { Welcome, TemplateOverview } = composeStories(stories)

describe('Onboarding stories smoke tests', () => {
  it('Welcome renders the welcome heading', async () => {
    render(<Welcome />)
    expect(
      await screen.findByRole('heading', { name: /welcome/i }),
    ).toBeInTheDocument()
  })

  it('TemplateOverview renders without error', async () => {
    render(<TemplateOverview />)
    expect(
      await screen.findByRole('heading', { name: /welcome/i }),
    ).toBeInTheDocument()
  })
})
