import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CLOUD_LOCATION_SORTS, LOCAL_LOCATION_SORTS } from '@/lib/locationSort'
import { LocationSortSelect } from './LocationSortSelect'

describe('LocationSortSelect', () => {
  it('user sees the four sorts in cloud and can pick one', async () => {
    // Given the cloud choices with Custom chosen
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <LocationSortSelect
        value="custom"
        options={CLOUD_LOCATION_SORTS}
        onChange={onChange}
      />,
    )

    // When the user opens the control
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))

    // Then the four sorts are offered
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Custom',
      'Name',
      'Last updated',
      'Last visited',
    ])

    // And picking one reports it
    await user.click(screen.getByRole('option', { name: 'Last visited' }))
    expect(onChange).toHaveBeenCalledWith('lastVisited')
  })

  it('user sees only Name and Custom in local mode', async () => {
    const user = userEvent.setup()
    render(
      <LocationSortSelect
        value="custom"
        options={LOCAL_LOCATION_SORTS}
        onChange={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Custom',
      'Name',
    ])
  })
})
