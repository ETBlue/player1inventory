import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { getLocations } from '@/db/operations'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from '@/hooks/useActiveLocation'
import { importCloudData } from '@/lib/importData'
import { PostLoginMigrationDialog } from '.'

// Partial mock so a test can hold the location query unresolved.
vi.mock('@/db/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/operations')>()
  return { ...actual, getLocations: vi.fn(() => actual.getLocations()) }
})

vi.mock('@/lib/exportData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exportData')>()
  return { ...actual, fetchLocalPayload: vi.fn().mockResolvedValue({}) }
})

vi.mock('@/lib/importData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/importData')>()
  return { ...actual, importCloudData: vi.fn().mockResolvedValue(undefined) }
})

// The CLOUD location list, served to `useLocations` in cloud mode. It is
// deliberately shaped so it can never be mistaken for the local list: cloud ids
// are server-generated cuids, local ones are the `'local'` sentinel plus
// whatever `createLocation` minted. A test that seeds both stores with the same
// shape cannot tell which list the dialog read.
const mockGetLocationsQuery = vi.fn(() => ({
  data: undefined as { locations: unknown[] } | undefined,
  loading: false,
  error: undefined,
}))

function mockCloudLocations(rows: { id: string; name: string }[]) {
  mockGetLocationsQuery.mockReturnValue({
    data: {
      locations: rows.map((row, order) => ({
        __typename: 'Location',
        ...row,
        order,
        isDefault: order === 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    },
    loading: false,
    error: undefined,
  })
}

// This per-file factory REPLACES the one in `src/test/setup.ts`, so the other
// location hooks are re-stubbed here or the real Apollo hooks run and demand a
// provider.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const mutationStub = () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    {},
  ]
  return {
    ...original,
    useGetLocationsQuery: () => mockGetLocationsQuery(),
    useCreateLocationMutation: mutationStub,
    useUpdateLocationMutation: mutationStub,
    useDeleteLocationMutation: mutationStub,
    useReorderLocationsMutation: mutationStub,
    // `ActiveLocationProvider` calls this on every render (Rules of Hooks).
    useBootstrapCartsMutation: mutationStub,
  }
})

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>
        <PostLoginMigrationDialog />
      </ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

async function seedLocations(...entries: Array<[string, string]>) {
  const now = new Date()
  await db.locations.bulkPut(
    entries.map(([id, name], order) => ({
      id,
      name,
      order,
      isDefault: id === 'local',
      createdAt: now,
      updatedAt: now,
    })),
  )
}

// REWRITTEN BY CLOUD LOCATIONS PR 4b TASK 7. This file held two describes and
// 5 its, all about `MigrationLocationWarningDialog`: the warning named the one
// local location whose stock would be copied and listed the ones left behind,
// and the dialog read the LOCAL locations table to build it. The copy keeps
// every location now, so the warning stopped being true and the component was
// deleted. These 3 its pin what is left.
describe('PostLoginMigrationDialog — signing in copies the local pantry', () => {
  beforeEach(async () => {
    localStorage.removeItem('migration-prompted')
    // A local pantry is what puts the hook into the 'prompting' state.
    await db.items.put({
      id: 'item-1',
      name: 'Milk',
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importCloudData).mockClear()
    vi.mocked(getLocations).mockReset()
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })
    await db.items.clear()
    await db.locations.clear()
  })

  it('user with several locations has the whole pantry copied on one press', async () => {
    // Given two LOCAL locations with 'office' active — the case that used to
    // raise a warning because only one location's stock would travel
    await seedLocations(['local', 'My Home'], ['office', 'Office'])
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt
    await user.click(await screen.findByRole('button', { name: 'Import' }))

    // Then the copy runs on that one press — no second confirmation, and the
    // call names no location, so every location travels
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    const call = vi.mocked(importCloudData).mock.calls[0]
    expect(call[1]).toBe('skip')
    expect(call[3]).toBeUndefined()
  })

  it('user with a single location has their pantry copied', async () => {
    // Given only the default location
    await seedLocations(['local', 'My Home'])
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt
    await user.click(await screen.findByRole('button', { name: 'Import' }))

    // Then the copy runs
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
  })

  // NEGATIVE CONTROL, named as one. Deleting a component cannot make its
  // heading appear, so this assertion passes trivially now. It is here to
  // catch a re-introduced confirmation step, not as evidence of anything.
  it('user is not asked a second question before the copy', async () => {
    // Given a multi-location local pantry in cloud mode, where the cloud
    // account holds a DIFFERENT single location — the old warning read one
    // list or the other, so the two stores are seeded to disagree
    await seedLocations(['local', 'My Home'], ['office', 'Office'])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    mockCloudLocations([{ id: 'clh0me00000000000000000a', name: 'Cloud Home' }])
    localStorage.setItem(
      activeLocationStorageKey('cloud'),
      'clh0me00000000000000000a',
    )
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt
    await user.click(await screen.findByRole('button', { name: 'Import' }))

    // Then no further dialog appears and the copy has already run
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(
      screen.queryByRole('heading', { name: /will be copied/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy anyway' })).toBeNull()
  })
})
