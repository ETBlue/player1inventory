import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Location } from '@/types'
import { LocationPager } from './LocationPager'

const locations: Location[] = ['My Home', 'Cabin', 'Office'].map(
  (name, order) => ({
    id: `loc-${order}`,
    name,
    order,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }),
)

// A controlled harness so the pager's contract can be checked without the
// Stock tab around it — in particular the case where the parent REFUSES a page
// change (the Stock tab does exactly that when the form has unsaved edits).
function Harness({ accept = true }: { accept?: boolean }) {
  const [index, setIndex] = useState(0)
  return (
    <LocationPager
      locations={locations}
      currentIndex={index}
      activeLocationId="loc-0"
      onChange={(next) => {
        if (accept) setIndex(next)
      }}
      panelId="panel"
      tabIdPrefix="tab"
    />
  )
}

const dotOf = (tabName: string | RegExp) =>
  screen.getByRole('tab', { name: tabName }).querySelector('span')

describe('LocationPager', () => {
  it('marks the viewed page and the active location on different dots', async () => {
    const user = userEvent.setup()

    // Given the pager opens on the active location
    render(<Harness />)

    // Then that one dot carries both marks
    expect(dotOf(/my home/i)).toHaveAttribute('data-viewed')
    expect(dotOf(/my home/i)).toHaveAttribute('data-active')
    expect(dotOf('Cabin')).not.toHaveAttribute('data-viewed')
    expect(dotOf('Cabin')).not.toHaveAttribute('data-active')

    // When the user pages away
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then the two marks separate — the active marker does not follow the page
    expect(dotOf('Cabin')).toHaveAttribute('data-viewed')
    expect(dotOf('Cabin')).not.toHaveAttribute('data-active')
    expect(dotOf(/my home/i)).toHaveAttribute('data-active')
    expect(dotOf(/my home/i)).not.toHaveAttribute('data-viewed')
  })

  it('names the active location in words on every page', async () => {
    const user = userEvent.setup()

    // Given the pager opens on the active location
    render(<Harness />)
    expect(screen.getByText('Active')).toBeInTheDocument()

    // When the user pages to each other location
    // Then the caption keeps naming the active one — the dot's shape is not
    // the only sighted cue while browsing elsewhere
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))
    expect(screen.getByText('Active: My Home')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Office' }))
    expect(screen.getByText('Active: My Home')).toBeInTheDocument()
  })

  it('keeps focus on the selected dot when the parent refuses the change', async () => {
    const user = userEvent.setup()

    // Given a parent that refuses page changes (the Stock tab's unsaved-edits
    // guard opens a discard dialog instead of turning the page)
    render(<Harness accept={false} />)
    const firstTab = screen.getByRole('tab', { name: /my home/i })
    firstTab.focus()

    // When an arrow key asks for the next page
    await user.keyboard('{ArrowRight}')

    // Then focus stays on the dot that is actually selected — moving it to a
    // page the pager never turned to strands focus on the wrong dot
    expect(firstTab).toHaveFocus()
    expect(firstTab).toHaveAttribute('aria-selected', 'true')
  })

  it('moves focus with the page when the parent accepts the change', async () => {
    const user = userEvent.setup()

    render(<Harness />)
    screen.getByRole('tab', { name: /my home/i }).focus()

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Cabin' })).toHaveFocus()
  })
})
