import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { getLocations } from '@/db/operations'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
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
      createdAt: now,
      updatedAt: now,
    })),
  )
}

describe('PostLoginMigrationDialog — multi-location warning', () => {
  // The sign-in copy sends only the active location's stock to cloud (cloud has
  // no per-location ItemStock yet), so the user must be told what is left out.
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
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
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
