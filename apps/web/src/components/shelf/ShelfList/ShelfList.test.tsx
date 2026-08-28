import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Shelf } from '@/types'
import { ShelfList } from './ShelfList'

const baseShelf = {
  order: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const shelves: Shelf[] = [
  { ...baseShelf, id: 'filter-shelf', name: 'dairy', type: 'filter' },
  { ...baseShelf, id: 'selection-shelf', name: 'favorites', type: 'selection' },
]

// The card row is the GroupCard whose accessible name is the shelf name; the
// icon sits outside it, so walk up to the shared Card element to find it.
function iconClassesFor(name: string): string {
  const card = screen.getByRole('button', { name }).parentElement
  const icon = card?.querySelector('svg')
  return icon?.getAttribute('class') ?? ''
}

describe('ShelfList', () => {
  it('user can tell a filter shelf from a selection shelf by its card icon', () => {
    // Given one shelf of each type
    // When the list renders
    render(
      <ShelfList
        shelves={shelves}
        onShelfClick={() => {}}
        getItemCount={() => 3}
      />,
    )

    // Then each card carries the icon its type uses in shelf settings
    expect(iconClassesFor('dairy')).toContain('lucide-sliders-vertical')
    expect(iconClassesFor('favorites')).toContain('lucide-square-mouse-pointer')
  })
})
