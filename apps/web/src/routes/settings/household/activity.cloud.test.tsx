import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityAction } from '@/generated/graphql'
import type {
  ActivityEntry,
  useHouseholdActivity,
} from '@/hooks/useHouseholdActivity'
import { WithRouterContext } from '@/test/routerContext'
import { ActivityPage } from './activity'

// The Activity page in cloud mode (households H6, task J.6). The hook is
// replaced, so each test sets exactly the state the page must show. How the
// hook reads the server is tested in `hooks/useHouseholdActivity.test.tsx`;
// the stories (`activity.stories.tsx`) render the page with the real hook.

type HookResult = ReturnType<typeof useHouseholdActivity>

const hook = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/hooks/useHouseholdActivity', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useHouseholdActivity')>()
  return { ...actual, useHouseholdActivity: () => hook.current }
})

function entry(
  id: string,
  action: ActivityAction,
  fields: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    __typename: 'HouseholdActivityEntry',
    id,
    action,
    createdAt: '2026-11-20T10:05:00.000Z',
    actorName: 'Olive',
    actorIsMe: false,
    actorDeleted: false,
    targetName: null,
    targetIsMe: null,
    targetDeleted: null,
    locationName: null,
    fromRole: null,
    toRole: null,
    householdRole: null,
    count: null,
    importCounts: null,
    ...fields,
  }
}

const loadMore = vi.fn(async () => {})
const refetch = vi.fn()

function setHook(state: Partial<HookResult>) {
  hook.current = {
    data: undefined,
    isLoading: false,
    isError: false,
    errorCode: undefined,
    hasMore: false,
    loadMore,
    isLoadingMore: false,
    loadMoreFailed: false,
    refetch,
    ...state,
  } satisfies HookResult
}

function renderPage() {
  return render(
    <WithRouterContext initialPath="/settings/household/activity">
      <ActivityPage />
    </WithRouterContext>,
  )
}

beforeEach(() => {
  loadMore.mockReset()
  loadMore.mockImplementation(async () => {})
  refetch.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('Activity page', () => {
  it('user sees who changed what in the household, newest first', () => {
    // Given three rows, newest first
    setHook({
      data: [
        entry('a3', 'MEMBER_REMOVED', {
          targetName: 'mia',
          targetIsMe: false,
          targetDeleted: false,
        }),
        entry('a2', 'LOCATION_ROLE_SET', {
          targetName: 'Ben',
          targetIsMe: false,
          targetDeleted: false,
          locationName: 'my Kitchen',
          toRole: 'viewer',
        }),
        entry('a1', 'MEMBER_JOINED', { actorName: 'Ben' }),
      ],
    })
    renderPage()

    // Then the heading and one sentence per row, in that order
    expect(
      screen.getByRole('heading', { level: 1, name: 'Activity' }),
    ).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((li) => li.firstChild?.textContent)).toEqual([
      'Olive removed mia from the household',
      'Olive gave Ben the Viewer role on my Kitchen',
      'Ben joined the household',
    ])
  })

  it('user sees the stored name of a location that was deleted since', () => {
    // The server sends the name stored with the row; the location is gone
    setHook({
      data: [
        entry('g1', 'LOCATION_ITEMS_REMOVED', { locationName: 'old Garage' }),
      ],
    })
    renderPage()
    expect(
      screen.getByText('Olive removed all items from old Garage'),
    ).toBeInTheDocument()
  })

  it('user can load more, and Load more is gone at the end of the log', async () => {
    // Given a full page with more after it
    setHook({ data: [entry('a1', 'MEMBER_LEFT')], hasMore: true })
    const { rerender } = renderPage()

    // When the user presses Load more
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    // Then the next page is asked for
    expect(loadMore).toHaveBeenCalledTimes(1)

    // And when the log has no more rows, the button is gone
    setHook({
      data: [entry('a1', 'MEMBER_LEFT'), entry('a0', 'IMPORT')],
      hasMore: false,
    })
    rerender(
      <WithRouterContext initialPath="/settings/household/activity">
        <ActivityPage />
      </WithRouterContext>,
    )
    expect(screen.getByText('Olive imported data')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('Load more is off while the next page loads', () => {
    setHook({
      data: [entry('a1', 'MEMBER_LEFT')],
      hasMore: true,
      isLoadingMore: true,
    })
    renderPage()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeDisabled()
  })

  it('user sees a failed Load more, and can try again', async () => {
    setHook({
      data: [entry('a1', 'MEMBER_LEFT')],
      hasMore: true,
      loadMoreFailed: true,
    })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not load more. Try again.',
    )
    // The rows shown stay
    expect(screen.getByText('Olive left the household')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('focus moves to the first new row after Load more', async () => {
    // Given one row, and a Load more that adds a second
    setHook({ data: [entry('a1', 'MEMBER_LEFT')], hasMore: true })
    const { rerender } = renderPage()
    loadMore.mockImplementation(async () => {
      setHook({
        data: [entry('a1', 'MEMBER_LEFT'), entry('a0', 'IMPORT')],
        hasMore: false,
      })
      rerender(
        <WithRouterContext initialPath="/settings/household/activity">
          <ActivityPage />
        </WithRouterContext>,
      )
    })

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    // Then the new row has focus: the button it came from is gone
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(document.activeElement).toBe(items[1])
  })

  it('household member sees the no-access text with a link back, not a spinner', () => {
    // Given the server answers FORBIDDEN
    setHook({ isError: true, errorCode: 'FORBIDDEN' })
    renderPage()
    expect(
      screen.getByText('Only the owner and managers can see the activity.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to the household' }),
    ).toHaveAttribute('href', '/settings/household')
    // `LoadingSpinner` has no role; its icon spins
    expect(document.querySelector('.animate-spin')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('household manager demoted in another tab sees the no-access text, not the old rows', () => {
    // Given old rows are still in the cache, and the read now says FORBIDDEN:
    // `isError` stays false, only `errorCode` changes
    setHook({
      data: [entry('a1', 'MEMBER_LEFT')],
      isError: false,
      errorCode: 'FORBIDDEN',
    })
    renderPage()
    expect(
      screen.getByText('Only the owner and managers can see the activity.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Olive left the household')).toBeNull()
  })

  it('user sees Retry after a network error, and Retry reads again', async () => {
    setHook({ isError: true, errorCode: undefined })
    renderPage()
    expect(
      screen.getByText('Could not load the activity. Try again.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('user sees a spinner while the log loads', () => {
    setHook({ isLoading: true })
    renderPage()
    expect(document.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText('Nothing has happened here yet.')).toBeNull()
  })

  it('user sees "Nothing has happened here yet." for an empty log', () => {
    setHook({ data: [] })
    renderPage()
    expect(
      screen.getByText('Nothing has happened here yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })
})
