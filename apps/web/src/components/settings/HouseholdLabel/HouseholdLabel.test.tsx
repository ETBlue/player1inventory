import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HouseholdLabel } from '.'

// The 🏠 label (households H3a, task 3.13). The query stub honours `skip` the
// way Apollo does, so a local-mode render cannot see the household even though
// the stub has one.

type QueryResult = { data?: unknown; loading: boolean; error?: unknown }
const mockQuery = vi.fn<() => QueryResult>()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetHouseholdQuery: (options: { skip?: boolean }) =>
      options.skip ? { data: undefined, loading: false } : mockQuery(),
  }
})

function withName(name: string): QueryResult {
  return {
    data: {
      household: { __typename: 'Household', id: 'h1', name, role: 'member' },
    },
    loading: false,
  }
}

beforeEach(() => {
  mockQuery.mockReturnValue(withName('The Lab'))
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  vi.resetAllMocks()
})

describe('HouseholdLabel', () => {
  it('user sees "My data" in local mode', () => {
    localStorage.setItem('data-mode', 'local')
    render(<HouseholdLabel />)
    expect(screen.getByText('My data')).toBeInTheDocument()
    expect(screen.queryByText('The Lab')).not.toBeInTheDocument()
  })

  it('user sees the household name in cloud mode', () => {
    localStorage.setItem('data-mode', 'cloud')
    render(<HouseholdLabel />)
    expect(screen.getByText('The Lab')).toBeInTheDocument()
    expect(screen.queryByText('My data')).not.toBeInTheDocument()
  })

  it('user sees "My data" while the household name is loading', () => {
    localStorage.setItem('data-mode', 'cloud')
    mockQuery.mockReturnValue({ data: undefined, loading: true })
    render(<HouseholdLabel />)
    expect(screen.getByText('My data')).toBeInTheDocument()
  })

  it('user sees "My data" when the household name cannot be read', () => {
    localStorage.setItem('data-mode', 'cloud')
    mockQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('offline'),
    })
    render(<HouseholdLabel />)
    expect(screen.getByText('My data')).toBeInTheDocument()
  })
})
