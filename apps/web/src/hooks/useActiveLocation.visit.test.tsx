import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { type ReactNode, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  GetLocationsDocument,
  MarkLocationVisitedDocument,
} from '@/generated/graphql'
import { bootstrapCartsMock, cloudLocation } from '@/test/cloudFixtures'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import { useLocations } from './useLocations'

// The visit (households H7b task M.4, decision T80, owner decision O55-A),
// through real Apollo. When the server wrote the visit, the provider sets the
// cached `Location.lastVisitedAt`, so a list sorted by "Last visited" moves
// at once. When it did not (`false`, under 60 seconds), nothing changes.

type Mocks = NonNullable<MockedProviderProps['mocks']>

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)
vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const KITCHEN = 'clw3visit0000s9f8h7g6d5e1'
const GARAGE = 'clw3visit0001s9f8h7g6d5e2'

const getLocations = {
  request: { query: GetLocationsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: {
    data: {
      locations: [
        cloudLocation(KITCHEN, 'Cloud Kitchen', 0),
        cloudLocation(GARAGE, 'Cloud Garage', 1),
      ],
    },
  },
}

function visitAnswer(answer: boolean) {
  const answered = vi.fn(() => ({ data: { markLocationVisited: answer } }))
  return {
    answered,
    mock: {
      request: {
        query: MarkLocationVisitedDocument,
        variables: { locationId: GARAGE },
      },
      result: answered,
    },
  }
}

/** Shows each location's `lastVisitedAt`, or "none". */
function Visits() {
  const { data } = useLocations()
  return (
    <ul>
      {(data ?? []).map((l) => (
        <li key={l.id}>
          {l.name}:{' '}
          {(l as { lastVisitedAt?: string | null }).lastVisitedAt ?? 'none'}
        </li>
      ))}
    </ul>
  )
}

function renderApp(mocks: Mocks, { strict = false } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrap = strict ? StrictMode : Passthrough
  render(
    <Wrap>
      <MockedProvider
        mocks={mocks}
        cache={createCache()}
        mockLinkDefaultOptions={{ delay: 0 }}
      >
        <QueryClientProvider client={queryClient}>
          <ActiveLocationProvider>
            <Visits />
          </ActiveLocationProvider>
        </QueryClientProvider>
      </MockedProvider>
    </Wrap>,
  )
}

function Passthrough({ children }: { children: ReactNode }) {
  return <>{children}</>
}

describe('ActiveLocationProvider — the visit (households H7b task M.4)', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE)
  })

  afterEach(() => {
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  it('user sees the active location marked as visited now when the server wrote the visit', async () => {
    // Given the Garage is active and the server records the visit
    const visit = visitAnswer(true)
    renderApp([getLocations, bootstrapCartsMock, visit.mock])

    // Then the cached Garage gets a visit time, and the Kitchen does not
    await waitFor(() =>
      expect(screen.getByText(/^Cloud Garage: \d{4}-/)).toBeInTheDocument(),
    )
    expect(screen.getByText('Cloud Kitchen: none')).toBeInTheDocument()
  })

  it('nothing changes when the server did not write the visit', async () => {
    // A negative control: it stays green when the cache write is removed.
    // It proves only that `false` writes nothing.
    // Given the server answers false (the last visit is under 60 seconds old)
    const visit = visitAnswer(false)
    renderApp([getLocations, bootstrapCartsMock, visit.mock])

    // When the server has answered the visit
    await waitFor(() => expect(visit.answered).toHaveBeenCalledTimes(1))

    // Then the Garage still has no visit time
    await waitFor(() =>
      expect(screen.getByText('Cloud Garage: none')).toBeInTheDocument(),
    )
  })

  it('one change of location sends one visit, also when React runs the effects twice', async () => {
    // Given StrictMode, which mounts, unmounts and mounts again in development
    const visit = visitAnswer(true)
    renderApp([getLocations, bootstrapCartsMock, visit.mock], { strict: true })

    // When the visit has been written
    await waitFor(() =>
      expect(screen.getByText(/^Cloud Garage: \d{4}-/)).toBeInTheDocument(),
    )

    // Then the server was asked once
    expect(visit.answered).toHaveBeenCalledTimes(1)
  })
})
