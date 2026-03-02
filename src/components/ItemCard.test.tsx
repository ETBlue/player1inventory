import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Item, Tag, TagType } from '@/types'
import { TagColor } from '@/types'
import { ItemCard } from './ItemCard'

vi.mock('@/hooks', () => ({
  useLastPurchaseDate: () => ({ data: undefined }),
}))

// Mock TanStack Router Link since it requires RouterProvider context
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      children?: React.ReactNode
      to?: string
      params?: unknown
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

const mockItem: Item = {
  id: 'item-1',
  name: 'Milk',
  tagIds: ['tag-1'],
  targetUnit: 'package',
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
  consumeAmount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockTag: Tag = { id: 'tag-1', name: 'Dairy', typeId: 'tt-1' }
const mockTagType: TagType = {
  id: 'tt-1',
  name: 'Category',
  color: TagColor.teal,
}

describe('ItemCard tag badge variants', () => {
  it('renders tag badge with tint variant when tag is not in activeTagIds', () => {
    // Given activeTagIds that does not include the tag
    render(
      <ItemCard
        item={mockItem}
        tags={[mockTag]}
        tagTypes={[mockTagType]}
        activeTagIds={[]}
      />,
    )

    // Then badge uses the tint variant
    const badge = screen.getByTestId('tag-badge-Dairy')
    expect(badge).toHaveClass('bg-teal-tint')
    expect(badge).not.toHaveClass('bg-teal')
  })

  it('renders tag badge with bold variant when tag is in activeTagIds', () => {
    // Given activeTagIds that includes the tag
    render(
      <ItemCard
        item={mockItem}
        tags={[mockTag]}
        tagTypes={[mockTagType]}
        activeTagIds={['tag-1']}
      />,
    )

    // Then badge uses the bold variant
    const badge = screen.getByTestId('tag-badge-Dairy')
    expect(badge).toHaveClass('bg-teal')
    expect(badge).not.toHaveClass('bg-teal-tint')
  })

  it('renders tag badge with tint variant when activeTagIds is not provided', () => {
    // Given no activeTagIds prop (default unselected)
    render(
      <ItemCard item={mockItem} tags={[mockTag]} tagTypes={[mockTagType]} />,
    )

    // Then badge defaults to tint (unselected appearance)
    const badge = screen.getByTestId('tag-badge-Dairy')
    expect(badge).toHaveClass('bg-teal-tint')
  })
})
