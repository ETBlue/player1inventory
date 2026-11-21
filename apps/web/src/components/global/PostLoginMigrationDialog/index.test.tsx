import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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

// The household choice (households H7 task L.5). `householdServer` answers
// `MyHouseholds`, `SetActiveHousehold` and `CreateHousehold` through the
// factory below. The move itself (clear the cache, reload) is a spy, so the
// test sees WHEN it is called and nothing reloads; it is tested in
// `apollo/householdGuard.test.ts`.
type ChoiceRow = {
  __typename: 'HouseholdChoice'
  id: string
  name: string
  role: 'owner' | 'manager' | 'member'
  isActive: boolean
}
const { householdServer, switchMock } = vi.hoisted(() => ({
  householdServer: {
    myHouseholds: undefined as ChoiceRow[] | undefined,
    setActive: vi.fn(),
    create: vi.fn(),
  },
  switchMock: vi.fn(async (_id: string, _options?: { to?: string }) => {}),
}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return { ...actual, switchToHousehold: switchMock }
})

function resetHouseholdServer() {
  householdServer.myHouseholds = undefined
  householdServer.setActive.mockReset()
  householdServer.setActive.mockImplementation(
    async ({ variables }: { variables: { householdId: string } }) => ({
      data: {
        setActiveHousehold: {
          __typename: 'Household',
          id: variables.householdId,
          name: 'unused',
          role: 'owner',
        },
      },
    }),
  )
  householdServer.create.mockReset()
  householdServer.create.mockResolvedValue({
    data: {
      createHousehold: {
        __typename: 'Household',
        id: 'hh-new',
        name: 'Camp',
        role: 'owner',
      },
    },
  })
  switchMock.mockReset()
  switchMock.mockResolvedValue(undefined)
}
beforeEach(resetHouseholdServer)

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
    // The household choice (task L.5). `householdServer` in this file
    // answers them; see there.
    useMyHouseholdsQuery: () => ({
      data: householdServer.myHouseholds
        ? { myHouseholds: householdServer.myHouseholds }
        : undefined,
      loading: false,
      error: undefined,
    }),
    useSetActiveHouseholdMutation: () => [householdServer.setActive, {}],
    useCreateHouseholdMutation: () => [householdServer.create, {}],
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

function renderDialog({ paused = false }: { paused?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>
        <PostLoginMigrationDialog paused={paused} />
      </ActiveLocationProvider>
    </QueryClientProvider>
  )
  const result = render(tree())
  // Renders the same tree again, so a changed mock (the household) is read.
  return { ...result, rerenderDialog: () => result.rerender(tree()) }
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

// Owner decision O40 (households H6 task K.0): a stored `clear` copy deletes
// the household's catalog and locations first, so its Copy here opens a
// second confirm that asks for the household name, typed exactly. This
// presses Copy here, types the name and confirms.
async function confirmClearCopy(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Copy here' }))
  await user.type(
    await screen.findByLabelText('Type Our Home to confirm'),
    'Our Home',
  )
  await user.click(screen.getByRole('button', { name: 'Copy here' }))
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
    // Unmount FIRST. Testing Library's own cleanup runs after this hook, so
    // without it the dialog is still mounted while the lines below clear
    // localStorage and change the household, and its late effects and
    // dialog can reach the NEXT test. Measured 2026-11-19: "user who joined
    // another household is still asked here", run with the test before it,
    // failed 1 run in 3 (and once on the code before that day's fix) with
    // the dialog either missing or marked `aria-hidden`. With this line it
    // passed 15 runs in a row. Which late write causes it was not proven.
    cleanup()
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
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))

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
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))
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
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))
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

    // When the user presses Copy here after sign-in, and types the name
    const user = userEvent.setup()
    renderDialog()
    await confirmClearCopy(user)

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

    // When the user presses Copy here after sign-in, and types the name
    const user = userEvent.setup()
    renderDialog()
    await confirmClearCopy(user)

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
    // Unmount first; see the first afterEach in this file.
    cleanup()
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

  it('user who owns the household cannot clear and copy until the name is typed exactly', async () => {
    // Given the question is open for a stored `clear` copy into "Our Home"
    const user = userEvent.setup()
    renderDialog()

    // When the owner presses Copy here
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))

    // Then nothing is cleared or copied by that press alone
    await drain()
    expect(importCloudData).not.toHaveBeenCalled()

    // And a field asks for the household name, and the confirm is off
    const field = await screen.findByLabelText('Type Our Home to confirm')
    const confirm = screen.getByRole('button', { name: 'Copy here' })
    expect(confirm).toBeDisabled()

    // When the name is typed with the wrong case
    await user.type(field, 'our home')
    await drain()

    // Then the confirm is still off, and nothing was cleared or copied
    expect(confirm).toBeDisabled()
    expect(importCloudData).not.toHaveBeenCalled()

    // When the name is typed exactly as stored and confirmed
    await user.clear(field)
    await user.type(field, 'Our Home')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    // Then the copy runs with `clear`
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))
    expect(callArgs(vi.mocked(importCloudData).mock, 0)[1]).toBe('clear')
  })

  it('user copying with a stored skip is not asked for the name', async () => {
    // Given the question is open for a stored `skip` copy, which deletes
    // nothing, and the local data has no location that needs a choice
    localStorage.setItem('migration-strategy', 'skip')
    const user = userEvent.setup()
    renderDialog()

    // When the owner presses Copy here
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))

    // Then no name is asked for: the copy goes on to its next step
    expect(
      await screen.findByRole('heading', {
        name: 'Import into which location?',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Type Our Home to confirm')).toBeNull()
  })

  it('user pressing Copy here has the stored copy run', async () => {
    // Given the question is open for a stored `clear` copy
    const user = userEvent.setup()
    renderDialog()

    // When the user presses Copy here and types the household name
    await confirmClearCopy(user)

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

// Bug 2026-11-19 (docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md).
// The question with NO stored strategy (local items, `migration-prompted`
// unset) used to read "Import local data to cloud?": it named no household,
// and a member was taken through "Import into which location?" before the
// server refused. It now asks like the stored copy (owner decision O22-A).
// This copy always runs `skip` (`importData('append')`), so `canCopyInto`
// lets an owner and a manager copy, and never a member. A manager with
// `clear` cannot happen on this path.
describe('PostLoginMigrationDialog — the copy question names the household', () => {
  beforeEach(async () => {
    localStorage.removeItem('migration-prompted')
    // A local pantry is what puts the hook into the 'prompting' state.
    await db.items.put(makeItem({ id: 'item-1', name: 'Milk' }))
  })

  afterEach(async () => {
    // Unmount first; see the first afterEach in this file.
    cleanup()
    localStorage.clear()
    setHousehold('owner')
    vi.mocked(importCloudData).mockReset()
    vi.mocked(importCloudData).mockResolvedValue({
      skipped: { locationNames: [], rowCount: 0 },
    })
    await db.items.clear()
  })

  async function drain() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('user who owns the household is asked, by name, with no shared line', async () => {
    // Given the owner of "Our Home" with local items
    setHousehold('owner')

    // When the dialog mounts
    renderDialog()

    // Then it names Our Home and offers the copy
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
  })

  it('user who is a manager is told the household is shared, and can copy', async () => {
    // Given a manager of "Our Home"
    setHousehold('manager')
    const user = userEvent.setup()
    renderDialog()

    // Then the shared line shows
    expect(
      await screen.findByText(
        /This household is shared, and you are not its owner/,
      ),
    ).toBeInTheDocument()

    // When the manager presses Copy here and picks the location
    await user.click(screen.getByRole('button', { name: 'Copy here' }))
    await screen.findByRole('heading', { name: 'Import into which location?' })
    await user.click(screen.getByRole('button', { name: 'Import' }))

    // Then the copy runs with `skip`, the strategy this question always uses
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))
    expect(callArgs(vi.mocked(importCloudData).mock, 0)[1]).toBe('skip')
  })

  it('user who is a member is told up front and never asked where', async () => {
    // Given a member of "Our Home" (decision O1: a member cannot import)
    setHousehold('member')
    const user = userEvent.setup()
    renderDialog()

    // Then the question names the household and says who can copy
    expect(
      await screen.findByRole('heading', {
        name: 'Copy your offline data into Our Home?',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Only the owner or a manager of this household can copy data into it/,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy here' })).toBeNull()

    // When the member presses Done
    await user.click(screen.getByRole('button', { name: 'Done' }))

    // Then nothing is copied, the location question never opens, and the
    // question is not asked again on this device
    await drain()
    expect(
      screen.queryByRole('heading', { name: 'Import into which location?' }),
    ).toBeNull()
    expect(importCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem('migration-prompted')).toBe('1')
  })

  it('nothing is asked while the household is loading, and the question comes once it loads', async () => {
    // Given local items and a household that has not loaded
    setHousehold('loading')
    const { rerenderDialog } = renderDialog()
    await drain()

    // Then nothing is asked yet, and nothing is stored
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(localStorage.getItem('migration-prompted')).toBeNull()

    // When the household loads
    setHousehold('owner')
    rerenderDialog()

    // Then the question comes, naming it
    expect(
      await screen.findByRole('heading', {
        name: 'Copy your offline data into Our Home?',
      }),
    ).toBeInTheDocument()
  })

  it('user still sees the role sentence when the server refuses anyway', async () => {
    // Given a manager (offered the copy) whose role the server refuses, for
    // example because an owner changed it a moment ago
    setHousehold('manager')
    vi.mocked(importCloudData).mockRejectedValueOnce(
      new ImportRefusedError('role'),
    )
    const user = userEvent.setup()
    renderDialog()

    // When the manager copies
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))
    await screen.findByRole('heading', { name: 'Import into which location?' })
    await user.click(screen.getByRole('button', { name: 'Import' }))

    // Then the role sentence is shown
    expect(
      await screen.findByText(
        /Only the owner or a manager of your household can copy data into it/,
      ),
    ).toBeInTheDocument()
  })
})

// Bug 2026-11-19 (docs/global/bugs/2026-11-19-bug-join-turns-off-copy-prompt.md).
// The join page used to turn the question off for good. Now the dialog skips
// only the household joined, and waits on the join and sign-in pages.
describe('PostLoginMigrationDialog — after joining a household', () => {
  beforeEach(async () => {
    setHousehold('manager')
    await db.items.put(makeItem({ id: 'item-1', name: 'Milk' }))
  })

  afterEach(async () => {
    // Unmount first; see the first afterEach in this file.
    cleanup()
    localStorage.clear()
    setHousehold('owner')
    await db.items.clear()
  })

  async function drain() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('user in the household they joined is not asked to copy', async () => {
    // Given the household of this test ('hh-1') was joined on this device
    localStorage.setItem('migration-skip-households', JSON.stringify(['hh-1']))

    // When the dialog mounts there
    renderDialog()
    await drain()

    // Then nothing is asked
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('user who joined another household is still asked here', async () => {
    // Given ANOTHER household was joined on this device
    localStorage.setItem(
      'migration-skip-households',
      JSON.stringify(['hh-other']),
    )

    // When the dialog mounts in this one
    renderDialog()

    // Then the question comes
    expect(
      await screen.findByRole('button', { name: 'Copy here' }),
    ).toBeInTheDocument()
  })

  it('nothing is asked while the dialog is paused', async () => {
    // Given the person is on the join page
    renderDialog({ paused: true })
    await drain()

    // Then nothing is asked
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

// Households H7 task L.5 (decision T73, owner decision O22-A). The person is
// in several households; "Our Home" (`hh-1`) is the one the page shows. The
// choice lists only households where `canCopyInto` allows the copy, the one
// shown first, plus "A new household". Picking another one moves the page
// there and copies nothing into the household shown.
describe('PostLoginMigrationDialog — the copy can go into another household', () => {
  function choices(
    ...rows: Array<[string, string, 'owner' | 'manager' | 'member']>
  ) {
    householdServer.myHouseholds = rows.map(([id, name, role]) => ({
      __typename: 'HouseholdChoice',
      id,
      name,
      role,
      isActive: id === 'hh-1',
    }))
  }

  function storedCopy(strategy: 'skip' | 'clear') {
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
    localStorage.setItem('migration-strategy', strategy)
  }

  // Cloud mode: `useMyHouseholds` reads nothing in local mode. In cloud mode
  // `useLocations` reads the cloud list, so it is served here.
  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    mockCloudLocations([{ id: 'cloud_home', name: 'Home' }])
  })

  afterEach(async () => {
    // Unmount first; see the first afterEach in this file.
    cleanup()
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })
    localStorage.clear()
    sessionStorage.clear()
    setHousehold('owner')
    vi.mocked(importCloudData).mockClear()
    vi.mocked(getLocations).mockReset()
    await db.items.clear()
  })

  async function drain() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  function radioNames() {
    const group = screen.getByRole('radiogroup', { name: 'Copy into' })
    return Array.from(group.querySelectorAll('[role="radio"]')).map((radio) => {
      const label = group.querySelector(`label[for="${radio.id}"]`)
      return [label?.textContent, radio.getAttribute('aria-checked')]
    })
  }

  it('user sees the households they may copy into, the one shown first, and a new household', async () => {
    // Given a stored skip copy, owner of Our Home, manager of Chen flat,
    // member of Lee house
    storedCopy('skip')
    setHousehold('owner')
    choices(
      ['hh-1', 'Our Home', 'owner'],
      ['hh-chen', 'Chen flat', 'manager'],
      ['hh-lee', 'Lee house', 'member'],
    )

    // When the dialog mounts
    renderDialog()

    // Then the member household is not offered, and Our Home is selected
    await screen.findByRole('radiogroup', { name: 'Copy into' })
    expect(radioNames()).toEqual([
      ['Our Home (Owner)', 'true'],
      ['Chen flat (Manager)', 'false'],
      ['A new household', 'false'],
    ])
    expect(
      screen.getByRole('radio', { name: 'Chen flat (Manager)' }),
    ).toBeInTheDocument()
  })

  it('user copying with clear is offered only the households they own', async () => {
    // Given a stored clear copy, owner of Our Home and of Camp, manager of
    // Chen flat
    storedCopy('clear')
    setHousehold('owner')
    choices(
      ['hh-1', 'Our Home', 'owner'],
      ['hh-chen', 'Chen flat', 'manager'],
      ['hh-camp', 'Camp', 'owner'],
    )

    // When the dialog mounts
    renderDialog()

    // Then Chen flat is not offered
    await screen.findByRole('radiogroup', { name: 'Copy into' })
    expect(radioNames().map(([name]) => name)).toEqual([
      'Our Home (Owner)',
      'Camp (Owner)',
      'A new household',
    ])
  })

  it('user picking another household has the page move there, and nothing copied here', async () => {
    // Given a stored skip copy and two households
    storedCopy('skip')
    setHousehold('owner')
    choices(['hh-1', 'Our Home', 'owner'], ['hh-chen', 'Chen flat', 'manager'])
    const user = userEvent.setup()
    renderDialog()

    // When the user picks Chen flat and presses Move there and copy
    await user.click(
      await screen.findByRole('radio', { name: 'Chen flat (Manager)' }),
    )
    expect(
      screen.getByRole('heading', {
        name: 'Copy your offline data into Chen flat?',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/This page moves to Chen flat first/)).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Move there and copy' }),
    )
    await drain()

    // Then the server is told, the page moves to Chen flat, and nothing is
    // copied into Our Home
    expect(householdServer.setActive).toHaveBeenCalledWith({
      variables: { householdId: 'hh-chen' },
    })
    expect(switchMock).toHaveBeenCalledWith('hh-chen', { to: '/' })
    expect(sessionStorage.getItem('copy-into-household')).toBe('hh-chen')
    expect(importCloudData).not.toHaveBeenCalled()
  })

  it('user picking the household shown copies here, as before', async () => {
    // Given a stored skip copy and two households
    storedCopy('skip')
    setHousehold('owner')
    choices(['hh-1', 'Our Home', 'owner'], ['hh-chen', 'Chen flat', 'manager'])
    const user = userEvent.setup()
    renderDialog()

    // When the user presses Copy here with Our Home selected
    await user.click(await screen.findByRole('button', { name: 'Copy here' }))

    // Then the page does not move, and the location question opens
    expect(
      await screen.findByRole('heading', {
        name: 'Import into which location?',
      }),
    ).toBeInTheDocument()
    expect(householdServer.setActive).not.toHaveBeenCalled()
    expect(switchMock).not.toHaveBeenCalled()
  })

  it('user picking a new household names it, and it is created before the move', async () => {
    // Given the plain question (no stored strategy) and one household
    localStorage.removeItem('migration-prompted')
    await db.items.put(makeItem({ id: 'item-1', name: 'Milk' }))
    setHousehold('owner')
    choices(['hh-1', 'Our Home', 'owner'])
    const user = userEvent.setup()
    renderDialog()

    // When the user picks A new household, names it Camp, and confirms
    await user.click(
      await screen.findByRole('radio', { name: 'A new household' }),
    )
    expect(
      screen.getByRole('heading', {
        name: 'Copy your offline data into a new household?',
      }),
    ).toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: 'Name of the new household' }),
      'Camp',
    )
    await user.click(
      screen.getByRole('button', { name: 'Move there and copy' }),
    )
    await drain()

    // Then it is created, and the page moves there with skip waiting
    expect(householdServer.create).toHaveBeenCalledWith({
      variables: { name: 'Camp', alsoWhenMember: true },
    })
    expect(switchMock).toHaveBeenCalledWith('hh-new', { to: '/' })
    expect(localStorage.getItem('migration-strategy')).toBe('skip')
    expect(importCloudData).not.toHaveBeenCalled()
  })

  it('user who is a member here but a manager elsewhere has the other household selected', async () => {
    // Given a stored skip copy, a member of Our Home, a manager of Chen flat
    storedCopy('skip')
    setHousehold('member')
    choices(['hh-1', 'Our Home', 'member'], ['hh-chen', 'Chen flat', 'manager'])

    // When the dialog mounts
    renderDialog()

    // Then Our Home is not offered, and Chen flat is selected and named
    expect(
      await screen.findByRole('heading', {
        name: 'Copy your offline data into Chen flat?',
      }),
    ).toBeInTheDocument()
    expect(radioNames()).toEqual([
      ['Chen flat (Manager)', 'true'],
      ['A new household', 'false'],
    ])
    expect(
      screen.getByRole('button', { name: 'Move there and copy' }),
    ).toBeInTheDocument()
  })

  it('user who is a member everywhere sees the sentence and Done, with no choice', async () => {
    // Given a stored skip copy and member roles only
    storedCopy('skip')
    setHousehold('member')
    choices(['hh-1', 'Our Home', 'member'], ['hh-lee', 'Lee house', 'member'])

    // When the dialog mounts
    renderDialog()

    // Then today's sentence and Done, and no household list
    expect(
      await screen.findByRole('button', { name: 'Done' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Only the owner or a manager/)).toBeVisible()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('user sees a household they joined on this device offered when they manage it', async () => {
    // Given Chen flat is in the skip list (joined here, owner decision O12-A)
    // and the person is a manager there
    storedCopy('skip')
    setHousehold('owner')
    choices(['hh-1', 'Our Home', 'owner'], ['hh-chen', 'Chen flat', 'manager'])
    localStorage.setItem(
      'migration-skip-households',
      JSON.stringify(['hh-chen']),
    )

    // When the dialog mounts
    renderDialog()

    // Then Chen flat is listed: the role decides, not the skip list
    // (owner decision O57-B)
    await screen.findByRole('radiogroup', { name: 'Copy into' })
    expect(radioNames().map(([name]) => name)).toEqual([
      'Our Home (Owner)',
      'Chen flat (Manager)',
      'A new household',
    ])
  })

  it('a household joined on this device where the person is a member is not offered', async () => {
    // Given Chen flat is in the skip list and the person is only a member
    // there, and Camp is a joined household they manage
    storedCopy('skip')
    setHousehold('owner')
    choices(
      ['hh-1', 'Our Home', 'owner'],
      ['hh-chen', 'Chen flat', 'member'],
      ['hh-camp', 'Camp', 'manager'],
    )
    localStorage.setItem(
      'migration-skip-households',
      JSON.stringify(['hh-chen', 'hh-camp']),
    )

    // When the dialog mounts
    renderDialog()

    // Then Camp is listed and Chen flat is not: a member may never copy
    await screen.findByRole('radiogroup', { name: 'Copy into' })
    expect(radioNames().map(([name]) => name)).toEqual([
      'Our Home (Owner)',
      'Camp (Manager)',
      'A new household',
    ])
  })

  it('user copying with clear into another household types THAT household name first', async () => {
    // Given a stored clear copy, owner of Our Home and of Camp
    storedCopy('clear')
    setHousehold('owner')
    choices(['hh-1', 'Our Home', 'owner'], ['hh-camp', 'Camp', 'owner'])
    const user = userEvent.setup()
    renderDialog()

    // When the user picks Camp and presses Move there and copy
    await user.click(await screen.findByRole('radio', { name: 'Camp (Owner)' }))
    await user.click(
      screen.getByRole('button', { name: 'Move there and copy' }),
    )

    // Then the page does not move until "Camp" is typed
    const field = await screen.findByLabelText('Type Camp to confirm')
    expect(switchMock).not.toHaveBeenCalled()
    await user.type(field, 'Camp')
    await user.click(
      screen.getByRole('button', { name: 'Move there and copy' }),
    )
    await drain()
    expect(switchMock).toHaveBeenCalledWith('hh-camp', { to: '/' })
    expect(importCloudData).not.toHaveBeenCalled()
  })

  it('user sees an alert when the move fails, and the dialog stays', async () => {
    // Given a server that refuses the switch
    storedCopy('skip')
    setHousehold('owner')
    choices(['hh-1', 'Our Home', 'owner'], ['hh-chen', 'Chen flat', 'manager'])
    householdServer.setActive.mockRejectedValue(forbiddenError())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    renderDialog()

    // When the user tries to move to Chen flat
    await user.click(
      await screen.findByRole('radio', { name: 'Chen flat (Manager)' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Move there and copy' }),
    )

    // Then an alert says so, the page stays, and nothing is copied
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not move to that household',
    )
    expect(switchMock).not.toHaveBeenCalled()
    expect(importCloudData).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Move there and copy' }),
    ).toBeEnabled()
  })

  it('household names render as stored, with no capitalize', async () => {
    // Given a household name with intentional casing
    storedCopy('skip')
    setHousehold('owner')
    choices(['hh-1', 'Our Home', 'owner'], ['hh-x', 'the iHerb flat', 'owner'])

    // When the dialog mounts
    renderDialog()

    // Then no ancestor of the name carries capitalize
    let node: HTMLElement | null = await screen.findByText('the iHerb flat')
    while (node) {
      expect(node.className).not.toMatch(/\bcapitalize\b/)
      node = node.parentElement
    }
  })
})
