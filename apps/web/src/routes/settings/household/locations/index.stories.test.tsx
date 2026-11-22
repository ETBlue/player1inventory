import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { DefaultOnly, WithLocations, LocalSortedByName } =
  composeStories(stories)

describe('Settings locations page stories smoke tests', () => {
  it('DefaultOnly renders the locations settings page heading', async () => {
    render(<DefaultOnly />)
    expect(
      await screen.findByRole('heading', { name: /locations/i }),
    ).toBeInTheDocument()
  })

  it('WithLocations renders a seeded location name', async () => {
    render(<WithLocations />)
    expect(await screen.findByText(/office/i)).toBeInTheDocument()
  })

  it('LocalSortedByName lists the locations by name, with no drag handle', async () => {
    render(<LocalSortedByName />)
    const main = await screen.findByRole('main')
    await within(main).findByText('Beach House')
    const names = within(within(main).getByRole('list'))
      .getAllByRole('listitem')
      .map((r) => r.textContent ?? '')
    expect(names[0]).toContain('Beach House')
    expect(names[1]).toContain('My Home')
    expect(names[2]).toContain('Office')
    expect(
      screen.queryByRole('button', { name: /^Drag to reorder/ }),
    ).not.toBeInTheDocument()
  })
})
