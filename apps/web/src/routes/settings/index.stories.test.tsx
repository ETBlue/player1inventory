import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, TraditionalChinese, ExplicitEnglish } = composeStories(stories)

describe('Settings index stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('TraditionalChinese renders without error', () => {
    render(<TraditionalChinese />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('ExplicitEnglish renders without error', () => {
    render(<ExplicitEnglish />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
