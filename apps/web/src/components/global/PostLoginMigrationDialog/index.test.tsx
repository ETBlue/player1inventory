import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { getLocations } from '@/db/operations'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from '@/hooks/useActiveLocation'
import { ImportRefusedError, importCloudData } from '@/lib/importData'
import { callArgs } from '@/test/narrow'
import type { Item } from '@/types'
import { PostLoginMigrationDialog } from '.'

// `usePostLoginMigration` reads only `items.length` from `getAllItems()`
// (src/hooks/usePostLoginMigration.ts:149-154), so NO field of the row is read
// by anything under test here. The factory requires `id` and `name` — what the
// test states about its row — and supplies the rest of `Item`'s required
// columns. The quantity fields are deliberately absent: since v15 they live on
// `ItemStock`, and the dialog never reads a quantity.
const makeItem = (
  overrides: Pick<Item, 'id' | 'name'> & Partial<Item>,
): Item => ({
  tagIds: [],
  targetUnit: 'package',
  consumeAmount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

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

// A STABLE apollo client, for the same reason `usePostLoginMigration.test.ts`
// stubs one: `src/test/setup.ts`'s `useApolloClient` returns a NEW object on
// every call, and that object is a dependency of the hook's effect. So the
// effect re-ran on every render, and once the auto-import's `catch` had removed
// the strategy key the re-run fell through to the prompting branch and set
// 'prompting' again — which replaced the error dialog within one render.
// Measured 2026-10-28 while writing the refusal test below.
const stableApolloClient = {
  cache: { evict: vi.fn(), gc: vi.fn() },
  query: vi.fn().mockResolvedValue({ data: {} }),
  mutate: vi.fn().mockResolvedValue({ data: {} }),
  resetStore: vi.fn().mockResolvedValue(null),
}
vi.mock('@apollo/client/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@apollo/client/react')>()
  return { ...original, useApolloClient: vi.fn(() => stableApolloClient) }
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

// The household a stored copy would go into (owner decision O22-A). Each test
// sets the name, the role, and whether it is still loading.
const { householdState } = vi.hoisted(() => ({
  householdState: {
    data: { id: 'hh-1', name: 'Our Home', role: 'owner' } as
      | { id: string; name: string; role: 'owner' | 'manager' | 'member' }
      | undefined,
    errorCode: undefined as string | undefined,
  },
}))
vi.mock('@/hooks/useHousehold', () => ({
  useHousehold: () => ({
    data: householdState.data,
    isLoading: householdState.data === undefined,
    isError: false,
    errorCode: householdState.errorCode,
  }),
}))

function setHousehold(
  role: 'owner' | 'manager' | 'member' | 'loading',
  errorCode?: string,
) {
  householdState.data =
    role === 'loading' ? undefined : { id: 'hh-1', name: 'Our Home', role }
  householdState.errorCode = errorCode
}

// The locations "Import into which location?" offers (households H4 task E.4).
vi.mock('@/hooks/useImportTargetLocations', () => ({
  useImportTargetLocations: (enabled: boolean) => ({
    data: enabled ? [{ id: 'cloud_home', name: 'Home' }] : undefined,
    isError: false,
  }),
}))

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

// What the server sends when the payload names a row id another account holds.
// The code in `extensions` is what `isForbiddenImportError` reads — the message
// is the bare word `Forbidden`, which the server also sends for "that row does
// not exist", so the text alone cannot tell the two apart.
function forbiddenError() {
  return new CombinedGraphQLErrors({
    errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
  })
}

// REWRITTEN BY CLOUD LOCATIONS PR 4b TASK 7. This file held two describes and
// 5 its, all about `MigrationLocationWarningDialog`: the warning named the one
// local location whose stock would be copied and listed the ones left behind,
// and the dialog read the LOCAL locations table to build it. The copy keeps
// every location now, so the warning stopped being true and the component was
// deleted. These 3 its pin what is left.
//
// Since households H4 task E.4 the copy asks ONE question after the Import
// press: "Import into which location?" (decision O3), because the local
// default location `'local'` is the one id the copy does not keep. The mocked
// `fetchLocalPayload` resolves to `{}`, a file with no locations, which asks
// the same question.
describe('PostLoginMigrationDialog — signing in copies the local pantry', () => {
  beforeEach(async () => {
    localStorage.removeItem('migration-prompted')
    // A local pantry is what puts the hook into the 'prompting' state.
    await db.items.put(makeItem({ id: 'item-1', name: 'Milk' }))
  })

  afterEach(async () => {
    localStorage.clear()
    setHousehold('owner')
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

    // Then the copy asks where, with Home checked, and has not run yet
    expect(
      await screen.findByRole('heading', {
        name: 'Import into which location?',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Home' })).toBeChecked()
    expect(importCloudData).not.toHaveBeenCalled()

    // When the user confirms
    await user.click(screen.getByRole('button', { name: 'Import' }))

    // Then the copy runs into Home. Every other location keeps its id.
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    const call = callArgs(vi.mocked(importCloudData).mock, 0)
    expect(call[1]).toBe('skip')
    expect(call[3]).toEqual({ target: { locationId: 'cloud_home' } })
  })

  it('user with a single location has their pantry copied', async () => {
    // Given only the default location
    await seedLocations(['local', 'My Home'])
    const user = userEvent.setup()
    renderDialog()

    // When the user accepts the import prompt and the location question
    await user.click(await screen.findByRole('button', { name: 'Import' }))
    await screen.findByRole('heading', { name: 'Import into which location?' })
    await user.click(screen.getByRole('button', { name: 'Import' }))

    // Then the copy runs
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
  })

  // NEGATIVE CONTROL, named as one. Deleting a component cannot make its
  // heading appear, so this assertion passes trivially now. It is here to
  // catch a re-introduced confirmation step, not as evidence of anything.
  // (Since households H4 task E.4 the one question is "Import into which
  // location?"; this test checks no OTHER question comes before the copy.)
  it('user is asked only where, not a second question, before the copy', async () => {
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

    // When the user accepts the import prompt and the location question
    await user.click(await screen.findByRole('button', { name: 'Import' }))
    await screen.findByRole('heading', { name: 'Import into which location?' })
    await user.click(screen.getByRole('button', { name: 'Import' }))

    // Then no further dialog appears and the copy has already run
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(
      screen.queryByRole('heading', { name: /will be copied/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy anyway' })).toBeNull()
  })

  // There is no story for this, on purpose. The error state is reachable only
  // by making `importCloudData` reject, which needs `vi.mock`, and a story
  // cannot do that — the same reason `ImportCard`'s error phase lives in its
  // `index.test.tsx` and its three hand-written fake stories were deleted on
  // 2026-10-13.
  //
  // Driven through the AUTO-IMPORT path, not the Import button, and the choice
  // matters. The prompting branch of the hook's effect calls `setState`
  // ('prompting') every time the effect re-runs, and it re-runs when the
  // location list goes from unknown to known. Pressing Import before that flip
  // lands puts the hook into 'error' and then straight back to 'prompting', so
  // a test that clicks the button races the Dexie location read — measured
  // 2026-10-28: it rendered the prompt again, not the error. The auto-import
  // cannot race it, because it only starts once the list is known, so no
  // further flip is left to overwrite the error. The Import-button path's own
  // state is pinned in `hooks/usePostLoginMigration.test.ts` instead.
  //
  // Since 2026-10-31 the hook no longer does this: once a copy has started,
  // the effect returns early (`importStarted` in `usePostLoginMigration.ts`).
  // So the race above is gone. This test was not changed.
  it('user sees why the copy was refused', async () => {
    // Given a stored copy strategy and a server that refuses the copy, because
    // the local data names a row id another cloud account holds.
    // `getLocations` is armed here rather than seeded through Dexie: the
    // `afterEach` above RESETS that mock, so by this test it resolves to
    // nothing and `locationsLoaded` would stay false — the auto-import would
    // never start and the prompt would show instead. Measured 2026-10-28.
    const now = new Date()
    vi.mocked(getLocations).mockResolvedValue([
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    localStorage.setItem('migration-strategy', 'clear')
    vi.mocked(importCloudData).mockRejectedValueOnce(forbiddenError())

    // When the user presses Copy here after sign-in
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))

    // Then the refusal is explained, rather than the dialog closing as if the
    // copy had worked or sitting on 'Copying…' for ever
    expect(
      await screen.findByText(
        /belong to another household, so the copy was refused/,
      ),
    ).toBeInTheDocument()

    // And there is one button to close it
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    // And the progress dialog it replaced is gone, so two are never up at once
    expect(
      screen.queryByText('Copying local data to cloud…'),
    ).not.toBeInTheDocument()
  })

  it('user who is not an owner or manager of the household is told so', async () => {
    // Given a stored `clear` copy that the import check refuses for the role
    const now = new Date()
    vi.mocked(getLocations).mockResolvedValue([
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    localStorage.setItem('migration-strategy', 'clear')
    vi.mocked(importCloudData).mockRejectedValueOnce(
      new ImportRefusedError('role'),
    )

    // When the user presses Copy here after sign-in
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))

    // Then the role sentence is shown, not the household one
    expect(
      await screen.findByText(
        /Only the owner or a manager of your household can copy data into it/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/belong to another household/),
    ).not.toBeInTheDocument()
  })
})

// ─── Owner decision O22-A: a stored copy asks first ──────────────────────────
describe('PostLoginMigrationDialog — a stored copy asks first', () => {
  beforeEach(() => {
    // The local location list must load, or the stored copy never gets to
    // the question (`locationsLoaded` in the hook).
    const now = new Date()
    vi.mocked(getLocations).mockResolvedValue([
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    localStorage.setItem('migration-strategy', 'clear')
  })

  afterEach(() => {
    localStorage.clear()
    setHousehold('owner')
    vi.mocked(importCloudData).mockClear()
    vi.mocked(getLocations).mockReset()
  })

  // Lets a copy that WOULD start reach `importCloudData` before an absence
  // check, so the check does not pass only because nothing has run yet.
  async function drain() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('user who owns the household is asked, by name, with no shared line', async () => {
    // Given a stored copy and the owner of "Our Home"
    setHousehold('owner')

    // When the dialog mounts
    renderDialog()

    // Then it asks about Our Home, with both buttons, and has copied nothing
    expect(
      await screen.findByRole('heading', {
        name: 'Copy your offline data into Our Home?',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy here' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: "Don't copy" }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/This household is shared/)).toBeNull()
    expect(importCloudData).not.toHaveBeenCalled()
  })

  it('user who is a manager is told the household is shared', async () => {
    // Given a stored `skip` copy and a manager of "Our Home"
    localStorage.setItem('migration-strategy', 'skip')
    setHousehold('manager')

    // When the dialog mounts
    renderDialog()

    // Then the shared line shows, and the copy is still offered
    expect(
      await screen.findByText(
        /This household is shared, and you are not its owner/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy here' }),
    ).toBeInTheDocument()
  })

  it('user pressing Copy here has the stored copy run', async () => {
    // Given the question is open for a stored `clear` copy
    const user = userEvent.setup()
    renderDialog()

    // When the user presses Copy here
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))

    // Then the copy runs with the stored strategy
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))
    expect(callArgs(vi.mocked(importCloudData).mock, 0)[1]).toBe('clear')
  })

  it("user pressing Don't copy has nothing copied and the stored copy removed", async () => {
    // Given the question is open
    const user = userEvent.setup()
    renderDialog()

    // When the user presses Don't copy
    await user.click(await screen.findByRole('button', { name: "Don't copy" }))

    // Then the dialog closes, nothing is copied, and the key is gone
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Copy your offline data/ }),
      ).toBeNull(),
    )
    await drain()
    expect(importCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem('migration-strategy')).toBeNull()
  })

  it('user who is a member is told they cannot copy, and is offered no copy', async () => {
    // Given a stored copy and a household member (decision O1: a member
    // cannot import)
    localStorage.setItem('migration-strategy', 'skip')
    setHousehold('member')
    const user = userEvent.setup()
    renderDialog()

    // Then the sentence says who can, and there is no Copy here
    expect(
      await screen.findByText(
        /Only the owner or a manager of this household can copy data into it/,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy here' })).toBeNull()

    // When the user presses Done
    await user.click(screen.getByRole('button', { name: 'Done' }))

    // Then nothing is copied and the stored copy is removed
    await drain()
    expect(importCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem('migration-strategy')).toBeNull()
  })

  it('user who is a manager with a stored clear is told only the owner can', async () => {
    // Given a stored `clear` copy, which the server allows to the owner only
    setHousehold('manager')
    renderDialog()

    // Then the clear sentence shows, and there is no Copy here
    expect(
      await screen.findByText(
        /Only the owner of this household can clear it and copy data into it/,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy here' })).toBeNull()
  })

  it('nothing is shown or copied while the household is loading', async () => {
    // Given a stored copy and a household that has not loaded
    setHousehold('loading')

    // When the dialog mounts
    renderDialog()
    await drain()

    // Then there is no dialog and no copy, and the key waits
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(importCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem('migration-strategy')).toBe('clear')
  })

  it('nothing is shown for a cached household the person has left', async () => {
    // Given a cached household next to a NO_HOUSEHOLD error
    setHousehold('owner', 'NO_HOUSEHOLD')

    // When the dialog mounts
    renderDialog()
    await drain()

    // Then there is no question about the household they left
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(importCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem('migration-strategy')).toBe('clear')
  })
})
