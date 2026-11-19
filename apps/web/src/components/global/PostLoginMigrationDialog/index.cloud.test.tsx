import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { ImportRefusedError, importCloudData } from '@/lib/importData'
import { CLOUD_LOCATIONS } from '@/test/cloudFixtures'
import {
  cloudServer,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { callArgs } from '@/test/narrow'
import { PostLoginMigrationDialog } from '.'

// The copy question with no stored strategy, in CLOUD mode, through the real
// `useHousehold` and `useLocations` hooks
// (docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md).
// `index.test.tsx` mocks `useHousehold` itself; here the household and the
// role come from a `GetHousehold` answer, the way the app reads them. Only
// the generated Apollo hooks are replaced (`cloudServerStub`).
//
// `importCloudData` is mocked: it talks to the Apollo client directly, not
// through a generated hook, so the stub cannot answer it. The test checks
// what reaches it, and makes it refuse for the last case.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

vi.mock('@/lib/exportData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exportData')>()
  return { ...actual, fetchLocalPayload: vi.fn().mockResolvedValue({}) }
})

vi.mock('@/lib/importData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/importData')>()
  return { ...actual, importCloudData: vi.fn().mockResolvedValue(undefined) }
})

// "Import into which location?" asks the server with `importCheck` through
// the Apollo client. Answer it here, as `index.test.tsx` does.
vi.mock('@/hooks/useImportTargetLocations', () => ({
  useImportTargetLocations: (enabled: boolean) => ({
    data: enabled ? [{ id: 'cloud_home', name: 'Home' }] : undefined,
    isError: false,
  }),
}))

function setRole(role: 'owner' | 'manager' | 'member') {
  cloudServer.queries.useGetHouseholdQuery = {
    household: {
      __typename: 'Household',
      id: 'hh-1',
      name: 'The Lin home',
      role,
    },
  }
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PostLoginMigrationDialog />
    </QueryClientProvider>,
  )
}

describe('PostLoginMigrationDialog — cloud, the copy question reads the real household', () => {
  beforeEach(async () => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.removeItem('migration-prompted')
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    // A local pantry is what puts the hook into the 'prompting' state.
    await db.items.put({
      id: 'item-1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importCloudData).mockReset()
    vi.mocked(importCloudData).mockResolvedValue({
      skipped: { locationNames: [], rowCount: 0 },
    })
    await db.items.clear()
  })

  it('user who is a household member is told up front, and nothing is sent', async () => {
    // Given a member of "The Lin home"
    setRole('member')
    const user = userEvent.setup()
    renderDialog()

    // Then the question names the household and offers no copy
    expect(
      await screen.findByRole('heading', {
        name: 'Copy your offline data into The Lin home?',
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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then no location question, and no copy
    expect(
      screen.queryByRole('heading', { name: 'Import into which location?' }),
    ).toBeNull()
    expect(importCloudData).not.toHaveBeenCalled()
  })

  it('user who is a household manager copies with skip after picking a location', async () => {
    // Given a manager of "The Lin home"
    setRole('manager')
    const user = userEvent.setup()
    renderDialog()

    // Then the question names the household and says it is shared
    expect(
      await screen.findByRole('heading', {
        name: 'Copy your offline data into The Lin home?',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/This household is shared/)).toBeInTheDocument()

    // When the manager presses Copy here and picks the location
    await user.click(screen.getByRole('button', { name: 'Copy here' }))
    await screen.findByRole('heading', { name: 'Import into which location?' })
    await user.click(screen.getByRole('button', { name: 'Import' }))

    // Then the copy runs with `skip`
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))
    expect(callArgs(vi.mocked(importCloudData).mock, 0)[1]).toBe('skip')
  })

  it('user still reads the role sentence when the server refuses anyway', async () => {
    // Given a manager, and a server that refuses the role (the role changed
    // after this tab read it)
    setRole('manager')
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
