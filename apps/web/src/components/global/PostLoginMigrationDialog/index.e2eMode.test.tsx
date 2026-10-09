import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  MIGRATION_PROMPTED_KEY,
  MIGRATION_STRATEGY_KEY,
} from '@/hooks/usePostLoginMigration'
import { fetchLocalPayload } from '@/lib/exportData'
import { importCloudData } from '@/lib/importData'

// WHY THIS FILE EXISTS
//
// `main.tsx` renders the E2E cloud tree with NO `ClerkProvider`, so every Clerk
// hook throws there. `PostLoginMigrationDialog` therefore has two branches —
// one that calls `useAuth()` and one that does not — chosen by
// `VITE_E2E_TEST_USER_ID`. These tests render the E2E branch.
//
// The mock below is what makes them evidence rather than decoration: it makes
// every Clerk hook throw, exactly as a missing provider would. If the E2E
// branch reached Clerk, the render would throw and these tests would be red.
//
// This per-file factory REPLACES the working `@clerk/react` mock in
// `src/test/setup.ts`.
vi.mock('@clerk/react', () => {
  const refuse = (name: string) => () => {
    throw new Error(`${name} called with no ClerkProvider in the tree`)
  }
  return {
    useAuth: refuse('useAuth'),
    useUser: refuse('useUser'),
    useClerk: refuse('useClerk'),
    ClerkProvider: ({ children }: { children: ReactNode }) => children,
  }
})

vi.mock('@/lib/exportData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exportData')>()
  return { ...actual, fetchLocalPayload: vi.fn() }
})

vi.mock('@/lib/importData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/importData')>()
  return { ...actual, importCloudData: vi.fn() }
})

const PAYLOAD = { version: 1, exportedAt: '2026-10-08T00:00:00.000Z' }

// The dialog reads `VITE_E2E_TEST_USER_ID` ONCE, at module evaluation. So the
// flag has to be stubbed before the module is first imported, which means the
// import has to be dynamic — a static `import … from '.'` at the top of this
// file would be hoisted above the stub and capture the flag as unset.
//
// There is deliberately no `vi.resetModules()` here. Resetting would re-run the
// `vi.mock` factories above and hand the re-imported component FRESH spies,
// while `importCloudData` in this file's scope would still point at the old
// ones — every assertion on them would read zero calls and pass for the wrong
// reason.
async function renderE2EDialog() {
  const { PostLoginMigrationDialog } = await import('.')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PostLoginMigrationDialog />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-user-id')
  localStorage.clear()
  vi.mocked(fetchLocalPayload).mockResolvedValue(
    PAYLOAD as unknown as Awaited<ReturnType<typeof fetchLocalPayload>>,
  )
  vi.mocked(importCloudData).mockResolvedValue(undefined)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  localStorage.clear()
  vi.mocked(fetchLocalPayload).mockReset()
  vi.mocked(importCloudData).mockReset()
  await db.items.clear()
})

describe('PostLoginMigrationDialog — the E2E branch needs no ClerkProvider', () => {
  it('user who chose a strategy before signing in has it applied, with no Clerk in the tree', async () => {
    // Given a strategy the user picked in Settings before switching to cloud,
    // and no `ClerkProvider` anywhere — every Clerk hook throws
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')

    // When the dialog mounts in E2E test mode
    await renderE2EDialog()

    // Then the copy runs with that strategy
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))
    expect(vi.mocked(importCloudData).mock.calls[0][1]).toBe('clear')

    // And the strategy is consumed so a reload cannot repeat it
    await waitFor(() =>
      expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBeNull(),
    )
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBe('1')
  })

  it('user with no stored strategy is asked instead of migrated', async () => {
    // Given local data but no strategy key — nobody asked for an auto-copy
    await db.items.put({
      id: 'item-1',
      name: 'Milk',
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // When the dialog mounts in E2E test mode
    await renderE2EDialog()

    // Then the user is asked, and nothing was copied without being asked
    expect(
      await screen.findByText('Import local data to cloud?'),
    ).toBeInTheDocument()
    expect(importCloudData).not.toHaveBeenCalled()
  })

  it('user who already answered the prompt is not migrated again', async () => {
    // Given a strategy key AND the prompt already answered — the state a
    // finished migration leaves behind
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    await db.items.put({
      id: 'item-1',
      name: 'Milk',
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // When the dialog mounts in E2E test mode
    await renderE2EDialog()

    // A copy would be dispatched from a microtask — `fetchLocalPayload`
    // resolves before `importCloudData` is reached — so let the queue drain.
    // Asserting straight after the render passes even with the
    // MIGRATION_PROMPTED_KEY check deleted, because the call has not happened
    // YET. Measured: without this drain, deleting that check leaves this test
    // green.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then nothing is copied and no dialog opens
    expect(importCloudData).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
