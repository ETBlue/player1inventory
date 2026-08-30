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

describe('PostLoginMigrationDialog — multi-location warning', () => {
  // The sign-in copy flattens the local payload onto ONE location before it
  // reaches cloud (`flattenPayloadForCloud`), so the user must be told what is
  // left out.
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
    await db.items.clear()
    await db.locations.clear()
  })

  it('user with several locations confirms the warning before the copy runs', async () => {
    // Given two locations with 'office' active
    await seedLocations(['local', 'My Home'], ['office', 'Office'])
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt
    await user.click(await screen.findByRole('button', { name: 'Import' }))

    // Then the warning names the location being copied, and nothing is sent yet
    expect(
      await screen.findByRole('heading', {
        name: 'Only Office will be copied',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/My Home/)).toBeInTheDocument()
    expect(importCloudData).not.toHaveBeenCalled()

    // When the user confirms
    await user.click(screen.getByRole('button', { name: 'Copy anyway' }))

    // Then the copy runs
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
  })

  it('user with a single location is not warned', async () => {
    // Given only the default location
    await seedLocations(['local', 'My Home'])
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt
    await user.click(await screen.findByRole('button', { name: 'Import' }))

    // Then the copy runs straight away — no extra confirmation
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(
      screen.queryByRole('heading', { name: /will be copied/ }),
    ).not.toBeInTheDocument()
  })

  it('user cannot start the copy while the location list is still loading', async () => {
    // Given the location query has not resolved yet
    vi.mocked(getLocations).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt
    await user.click(await screen.findByRole('button', { name: 'Import' }))

    // Then nothing is copied — treating an unresolved list as a single-location
    // pantry would skip the warning for a multi-location user who clicks fast
    expect(importCloudData).not.toHaveBeenCalled()
  })
})

// The warning is about a LOCAL → cloud copy, and this dialog only ever runs in
// cloud mode (its hook is gated on `isSignedIn`). Since `useLocations` became
// dual-mode it hands cloud mode the CLOUD list, which is not what is being
// copied — these two tests pin the dialog to the local list and the local
// active id. The two stores are seeded to DISAGREE, so a dialog reading the
// wrong one cannot pass either test.
describe('PostLoginMigrationDialog — cloud mode reads the LOCAL locations', () => {
  const CLOUD_HOME = 'clh0me00000000000000000a'
  const CLOUD_OFFICE = 'clh0me00000000000000000b'

  beforeEach(async () => {
    localStorage.setItem('data-mode', 'cloud')
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

  it('user with two LOCAL locations is warned even though cloud has only one', async () => {
    // Given two local locations with 'office' active locally, and a cloud
    // account holding a single location — nothing would be left behind if the
    // dialog looked at the cloud list, but 'My Home' really would be
    await seedLocations(['local', 'My Home'], ['office', 'Office'])
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    mockCloudLocations([{ id: CLOUD_HOME, name: 'Cloud Home' }])
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_HOME)
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt
    await user.click(await screen.findByRole('button', { name: 'Import' }))

    // Then the warning names the LOCAL location being copied and the local one
    // left behind, and nothing is sent yet
    expect(
      await screen.findByRole('heading', {
        name: 'Only Office will be copied',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/My Home/)).toBeInTheDocument()
    expect(screen.queryByText(/Cloud Home/)).not.toBeInTheDocument()
    expect(importCloudData).not.toHaveBeenCalled()
  })

  it('user with one LOCAL location is not warned even though cloud has two', async () => {
    // Given a single local location and a cloud account holding two — reading
    // the cloud list here would interrupt a copy that leaves nothing behind
    await seedLocations(['local', 'My Home'])
    mockCloudLocations([
      { id: CLOUD_HOME, name: 'Cloud Home' },
      { id: CLOUD_OFFICE, name: 'Cloud Office' },
    ])
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_HOME)
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt
    await user.click(await screen.findByRole('button', { name: 'Import' }))

    // Then the copy runs straight away — no spurious confirmation
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(
      screen.queryByRole('heading', { name: /will be copied/ }),
    ).not.toBeInTheDocument()
  })
})
