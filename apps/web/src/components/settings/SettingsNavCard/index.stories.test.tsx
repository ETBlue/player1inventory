import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { TagsLink, VendorsLink, RecipesLink, AllLinks } = composeStories(stories)

describe('SettingsNavCard stories smoke tests', () => {
  it('TagsLink renders without error', () => {
    render(<TagsLink />)
    expect(screen.getByText('Tags')).toBeInTheDocument()
  })

  it('VendorsLink renders without error', () => {
    render(<VendorsLink />)
    expect(screen.getByText('Vendors')).toBeInTheDocument()
  })

  it('RecipesLink renders without error', () => {
    render(<RecipesLink />)
    expect(screen.getByText('Recipes')).toBeInTheDocument()
  })

  it('AllLinks renders without error', () => {
    render(<AllLinks />)
    expect(screen.getByText('Manage your tags')).toBeInTheDocument()
  })
})
