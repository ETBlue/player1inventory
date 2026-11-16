import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { useApolloClient } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import type { HouseholdRole } from '@/generated/graphql'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from '@/hooks/useActiveLocation'
import type { ExportPayload } from '@/lib/exportData'
import {
  ImportRefusedError,
  type ImportSession,
  importCloudData,
} from '@/lib/importData'
import { callArgs, elementAt } from '@/test/narrow'
import { ImportCard } from '.'

// Only the cloud write path is stubbed; conflict detection and the local path
// run for real against fake-indexeddb.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/lib/importData', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/importData')>()
  return {
    ...original,
    importCloudData: vi.fn().mockResolvedValue({
      skipped: { locationNames: [], rowCount: 0 },
    }),
  }
})

// The caller's household role, read by the card through `useHousehold`
// (households H4 task E.4). `undefined` is what the shared Apollo stub in
// `src/test/setup.ts` gives: the role is not known yet.
const householdRole: { current: HouseholdRole | undefined } = {
  current: undefined,
}
vi.mock('@/hooks/useHousehold', () => ({
  useHousehold: () => ({
    data:
      householdRole.current === undefined
        ? undefined
        : { id: 'hh-1', name: 'The Lins', role: householdRole.current },
    isLoading: false,
    isError: false,
  }),
}))

// The locations the "Import into which location?" dialog offers.
vi.mock('@/hooks/useImportTargetLocations', () => ({
  useImportTargetLocations: (enabled: boolean) => ({
    data: enabled
      ? [
          { id: 'cloud_home', name: 'Home' },
          { id: 'cloud_garage', name: 'my Garage' },
        ]
      : undefined,
    isError: false,
  }),
}))

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>
        <ImportCard />
      </ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

// A post-v15 backup: stock lives on ItemStock rows, not on the item.
function v15Payload(...stockLocationIds: string[]) {
  const iso = new Date().toISOString()
  return {
    version: 1,
    exportedAt: iso,
    items: [
      {
        id: 'item-1',
        name: 'Milk',
        tagIds: [],
        createdAt: iso,
        updatedAt: iso,
      },
    ],
    itemStocks: stockLocationIds.map((locationId, i) => ({
      id: `stock-${i}`,
      itemId: 'item-1',
      locationId,
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: iso,
      updatedAt: iso,
    })),
    locations: [],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    cartItems: [],
    shelves: [],
  }
}

async function uploadPayload(container: HTMLElement, payload: unknown) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement
  const json = JSON.stringify(payload)
  const file = new File([json], 'backup.json', { type: 'application/json' })
  // jsdom's File has no .text() — the card reads the file with it.
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) })
  fireEvent.change(input, { target: { files: [file] } })
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

// REWRITTEN BY CLOUD LOCATIONS PR 4b TASK 3. This describe held three its
// that pinned `resolveFlattenLocationId`'s wiring: the card had to pick ONE of
// the backup's locations and pass it as `importCloudData`'s `locationId`, and
// had to REFUSE the import when the backup's locations were several and none
// of them this device's. Both the function and the refusal are gone —
// `importCloudData` keeps every location (since households H4 task E.4, the
// new id rule: only the local default `'local'` needs a choice, and these
// backups have no such row), so there is nothing to choose. The surviving
// rule is the inverse, and these two its assert it.
//
// The plan's list of dying tests named 14 its, all in `lib/importData.test.ts`.
// These three were not on it.
describe('ImportCard — cloud import carries every location', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importCloudData).mockClear()
    vi.mocked(toast.error).mockClear()
    await db.locations.clear()
  })

  it('user importing a multi-location backup in cloud mode is not asked to pick one', async () => {
    // Given cloud mode and a backup holding stock for two local locations
    await seedLocations(['local', 'My Home'], ['office', 'Office'])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    const { container } = renderCard()

    // When the user picks a v15 backup file
    await uploadPayload(container, v15Payload('local', 'office'))

    // Then the import runs with NO location named — every location travels
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(callArgs(vi.mocked(importCloudData).mock, 0)[3]).not.toHaveProperty(
      'locationId',
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('user importing a backup whose locations are all unknown here is not refused', async () => {
    // Given a backup written on another device, holding stock in two
    // locations, neither of which exists here — the case the old code refused
    await seedLocations(['local', 'My Home'])
    localStorage.setItem('data-mode', 'cloud')
    const { container } = renderCard()

    // When the user imports it
    await uploadPayload(container, v15Payload('kitchen-a1b2', 'garage-c3d4'))

    // Then it is imported, not refused: both locations are preserved
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })
})

// The error phase and its Retry button are cloud-only. What this describe
// covers is the hop between them: the session the failure carried must be the
// SAME session the retry hands back. If it is not, `importCloudData` starts a
// fresh session, every batch key is gone, and the retry re-sends the batches
// the first attempt already wrote.
//
// `lib/importData.test.ts` already covers the library side of that contract
// (three its, at :2415, :2506 and :2532). Nothing covered the UI wiring that
// connects the two — `ImportCard.tsx:183` reading `err.session`, :187 storing
// it, and :287-293 passing it back.
describe('ImportCard — Retry resumes the session the failure carried', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importCloudData).mockClear()
    vi.mocked(toast.error).mockClear()
    await db.locations.clear()
  })

  it('user retrying a failed cloud import resumes the session the failure carried', async () => {
    // Given cloud mode, and a first attempt that fails with a partly-done
    // session attached to the thrown error
    await seedLocations(['local', 'My Home'])
    localStorage.setItem('data-mode', 'cloud')
    const payload = v15Payload('local')
    const failedSession: ImportSession = {
      payload: payload as unknown as ExportPayload,
      strategy: 'skip',
      completedBatchKeys: new Set(['create:items:0']),
    }
    const failure = Object.assign(new Error('items'), {
      session: failedSession,
    })
    vi.mocked(importCloudData).mockRejectedValueOnce(failure)
    const { container } = renderCard()

    // When the user imports the backup and the import fails
    await uploadPayload(container, payload)
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))

    // Then the error message renders — the `phase: 'error'` branch is reached
    expect(
      await screen.findByText('Import failed during items.'),
    ).toBeInTheDocument()

    // And a Retry button renders
    const retry = screen.getByRole('button', { name: 'Retry' })

    // When the user presses Retry
    fireEvent.click(retry)

    // Then the second call carries the SAME session object back, with the
    // batch key the first attempt recorded still in it
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(2))
    const secondOptions = vi.mocked(importCloudData).mock.calls[1]?.[3]
    expect(secondOptions?.session).toBe(failedSession)
    expect([...(secondOptions?.session?.completedBatchKeys ?? [])]).toEqual([
      'create:items:0',
    ])
  })
})

// Inbound (file / cloud → local) must mirror the outbound rule: restored stock
// goes to the location the user is ACTIVE in, not always 'local'. Landing it in
// 'local' while the user is in another location renders an empty pantry with no
// explanation (PR D review I-4).
describe('ImportCard — local import lands in the active location', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(toast.error).mockClear()
    await db.locations.clear()
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
  })

  // A pre-v15 backup: stock inline on the item, no itemStocks table.
  function legacyPayload() {
    const iso = new Date().toISOString()
    return {
      version: 1,
      exportedAt: iso,
      items: [
        {
          id: 'item-1',
          name: 'Milk',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 4,
          refillThreshold: 1,
          packedQuantity: 3,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: iso,
          updatedAt: iso,
        },
      ],
      locations: [],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
      shelves: [],
    }
  }

  it('user restoring a legacy backup sees it in the location they are in', async () => {
    // Given local mode with 'office' as the active location
    await seedLocations(['local', 'My Home'], ['office', 'Office'])
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    const { container } = renderCard()

    // When the user restores a pre-v15 backup
    await uploadPayload(container, legacyPayload())

    // Then the synthesised stock lands in 'office' — the pantry they are
    // looking at — instead of the default location
    await waitFor(async () => {
      expect(await db.itemStocks.count()).toBe(1)
    })
    const stocks = await db.itemStocks.toArray()
    expect(elementAt(stocks, 0).locationId).toBe('office')
  })
})

// WHICH sentence the error phase shows when the server refuses the import
// because the file names another account's row ids.
//
// Before the import ownership guard (issue #327) this phase rendered
// `settings.import.importError` — "Import failed during {{entity}}." — with the
// raw Apollo message interpolated as the entity. For a refusal that message is
// the bare word `Forbidden`, so the user read "Import failed during Forbidden."
// `Forbidden` is not an entity, and the sentence says nothing about what to do.
//
// The `clear` strategy needs a SECOND sentence, not the same one. `clearAllData`
// runs before the uploads, so on `clear` the refusal arrives with the account
// already emptied — design decision 6 of
// docs/features/settings/2026-10-28-design-import-ownership-guard.md. The user
// has to be told both things happened.
//
// The strategy is read off the session the failure carried, which is how the
// real `importCloudData` reports it (its catch attaches `session`, and the
// session records the strategy the import ran with). So these two tests differ
// in exactly one input: that strategy.
describe('ImportCard — a cross-account refusal says so in words', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importCloudData).mockClear()
    vi.mocked(toast.error).mockClear()
    await db.locations.clear()
  })

  // The error Apollo builds from the server's `FORBIDDEN` response, carrying
  // the session the way `importCloudData`'s own catch does.
  function forbiddenFailure(strategy: ImportSession['strategy']) {
    const payload = v15Payload('local')
    const session: ImportSession = {
      payload: payload as unknown as ExportPayload,
      strategy,
      completedBatchKeys: new Set(),
    }
    const err = new CombinedGraphQLErrors({
      errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
    })
    return { payload, failure: Object.assign(err, { session }) }
  }

  it('user sees why a cross-account import was refused', async () => {
    // Given cloud mode and a `replace` import the server refuses with FORBIDDEN
    await seedLocations(['local', 'My Home'])
    localStorage.setItem('data-mode', 'cloud')
    const { payload, failure } = forbiddenFailure('replace')
    vi.mocked(importCloudData).mockRejectedValueOnce(failure)
    const { container } = renderCard()

    // When the user imports the backup and the import is refused
    await uploadPayload(container, payload)
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))

    // Then the refusal is explained, and nothing was imported
    expect(
      await screen.findByText(
        'Some rows in this file belong to another household, so the import was refused. Nothing was imported.',
      ),
    ).toBeInTheDocument()

    // And the raw word `Forbidden` is never printed as an entity name
    expect(
      screen.queryByText('Import failed during Forbidden.'),
    ).not.toBeInTheDocument()

    // And the Retry button is still offered
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('user sees that their cloud data was cleared before the refusal', async () => {
    // Given the same refusal, on the `clear` strategy — `clearAllData` has
    // already run by the time the server refuses
    await seedLocations(['local', 'My Home'])
    localStorage.setItem('data-mode', 'cloud')
    const { payload, failure } = forbiddenFailure('clear')
    vi.mocked(importCloudData).mockRejectedValueOnce(failure)
    const { container } = renderCard()

    // When the user imports the backup and the import is refused
    await uploadPayload(container, payload)
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))

    // Then the sentence says the cloud data is gone and the file is not
    expect(
      await screen.findByText(
        'Some rows in this file belong to another household, so the import was refused. Your cloud data was already cleared before that happened. Your backup file is unchanged.',
      ),
    ).toBeInTheDocument()

    // And NOT the sentence that claims nothing happened
    expect(
      screen.queryByText(
        'Some rows in this file belong to another household, so the import was refused. Nothing was imported.',
      ),
    ).not.toBeInTheDocument()
  })
})

// ─── Households H4 task E.4: role-aware import, the location dialog ─────────

// A local backup: its default location has the id 'local', so a cloud import
// asks where its rows go.
function localBackup() {
  const iso = new Date().toISOString()
  return {
    ...v15Payload('local'),
    locations: [
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: iso,
        updatedAt: iso,
      },
    ],
  }
}

// A cloud client whose catalog already holds `item-1`, so a backup that has
// it too stops at the conflict dialog.
function cloudClientWithMilk() {
  return {
    cache: { evict: vi.fn(), gc: vi.fn() },
    query: vi.fn().mockResolvedValue({
      data: {
        items: [{ id: 'item-1', name: 'Milk' }],
        tags: [],
        tagTypes: [],
        vendors: [],
        recipes: [],
        inventoryLogs: [],
        allCarts: [],
        allCartItems: [],
        shelves: [],
      },
    }),
    mutate: vi.fn().mockResolvedValue({ data: {} }),
    resetStore: vi.fn().mockResolvedValue(null),
  }
}

describe('ImportCard — who can import (households H4 task E.4)', () => {
  afterEach(async () => {
    localStorage.clear()
    householdRole.current = undefined
    vi.mocked(importCloudData).mockClear()
    vi.mocked(useApolloClient).mockRestore?.()
    await db.locations.clear()
  })

  it('user who is a household member sees why they cannot import, and no file button', () => {
    // Given cloud mode and the household role `member`
    localStorage.setItem('data-mode', 'cloud')
    householdRole.current = 'member'

    // When the card renders
    renderCard()

    // Then the card is there, with the line instead of the button
    expect(screen.getByText('Import data')).toBeInTheDocument()
    expect(
      screen.getByText('Only the owner or a manager can import data.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Import' }),
    ).not.toBeInTheDocument()
  })

  it('user who is a manager can pick a file', () => {
    // Given cloud mode and the household role `manager`
    localStorage.setItem('data-mode', 'cloud')
    householdRole.current = 'manager'

    // When the card renders
    renderCard()

    // Then the file button is there and enabled, and the member line is not
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled()
    expect(
      screen.queryByText('Only the owner or a manager can import data.'),
    ).not.toBeInTheDocument()
  })

  for (const [role, clearShown] of [
    ['manager', false],
    ['owner', true],
  ] as const) {
    it(`user who is ${role === 'owner' ? 'the owner' : 'a manager'} ${clearShown ? 'is' : 'is not'} offered Clear & import`, async () => {
      // Given cloud mode, the role, and a backup whose item is already there
      localStorage.setItem('data-mode', 'cloud')
      householdRole.current = role
      vi.mocked(useApolloClient).mockReturnValue(cloudClientWithMilk() as never)
      const { container } = renderCard()

      // When the user picks the backup
      await uploadPayload(container, v15Payload())

      // Then the conflict dialog offers skip and replace
      expect(
        await screen.findByRole('button', { name: 'Replace matches' }),
      ).toBeInTheDocument()
      // And Clear & import only to the owner
      const clear = screen.queryByRole('button', { name: 'Clear & import' })
      if (clearShown) expect(clear).toBeInTheDocument()
      else expect(clear).not.toBeInTheDocument()
    })
  }
})

describe('ImportCard — the import messages (households H4 decision T17)', () => {
  afterEach(async () => {
    localStorage.clear()
    householdRole.current = undefined
    vi.mocked(importCloudData).mockClear()
    await db.locations.clear()
  })

  it('user who is refused for their role is told so', async () => {
    // Given the import check refuses the role
    localStorage.setItem('data-mode', 'cloud')
    householdRole.current = 'manager'
    vi.mocked(importCloudData).mockRejectedValueOnce(
      new ImportRefusedError('role'),
    )
    const { container } = renderCard()

    // When the user imports a backup
    await uploadPayload(container, v15Payload())

    // Then the role sentence is shown, not the household one
    expect(
      await screen.findByText(
        'Only the owner or a manager can import data, so the import was refused. Nothing was imported.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/belong to another household/),
    ).not.toBeInTheDocument()
  })

  it('user importing a file with another household’s rows is told nothing was imported, even on clear', async () => {
    // Given the import check finds another household's row, on `clear`. The
    // check runs before the clear, so nothing was cleared.
    localStorage.setItem('data-mode', 'cloud')
    householdRole.current = 'owner'
    const refusal = Object.assign(new ImportRefusedError('anotherHousehold'), {
      session: {
        payload: v15Payload() as unknown as ExportPayload,
        strategy: 'clear',
        completedBatchKeys: new Set(),
      } satisfies ImportSession,
    })
    vi.mocked(importCloudData).mockRejectedValueOnce(refusal)
    const { container } = renderCard()

    // When the user imports
    await uploadPayload(container, v15Payload())

    // Then the sentence says nothing was imported, not that data was cleared
    expect(
      await screen.findByText(
        'Some rows in this file belong to another household, so the import was refused. Nothing was imported.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/already cleared/)).not.toBeInTheDocument()
  })

  it('user sees which locations were skipped after the import', async () => {
    // Given an import that skipped the Garage and two other rows
    localStorage.setItem('data-mode', 'cloud')
    householdRole.current = 'manager'
    vi.mocked(importCloudData).mockResolvedValueOnce({
      skipped: { locationNames: ['Garage', 'Attic'], rowCount: 2 },
    })
    const { container } = renderCard()

    // When the import finishes
    await uploadPayload(container, v15Payload())

    // Then the card names the skipped locations and counts the other rows
    expect(
      await screen.findByText(
        'Skipped, because you cannot edit them: Garage, Attic.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '2 rows were skipped, because they point at locations or items you cannot use.',
      ),
    ).toBeInTheDocument()
  })
})

describe('ImportCard — Import into which location? (households H4 task E.4)', () => {
  afterEach(async () => {
    localStorage.clear()
    householdRole.current = undefined
    vi.mocked(importCloudData).mockClear()
    await db.locations.clear()
  })

  it('user importing a local backup into cloud is asked where, with the first location checked', async () => {
    // Given cloud mode, a manager, and a backup from local mode
    localStorage.setItem('data-mode', 'cloud')
    householdRole.current = 'manager'
    const { container } = renderCard()

    // When the user picks it
    await uploadPayload(container, localBackup())

    // Then the dialog asks, with Home checked, and nothing is imported yet
    expect(
      await screen.findByRole('heading', {
        name: 'Import into which location?',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Home' })).toBeChecked()
    expect(importCloudData).not.toHaveBeenCalled()

    // When the user picks my Garage and confirms
    fireEvent.click(screen.getByRole('radio', { name: 'my Garage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    // Then the import runs with that location in its session
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))
    const options = callArgs(vi.mocked(importCloudData).mock, 0)[3]
    expect(options?.session?.target).toEqual({ locationId: 'cloud_garage' })
  })

  it('user importing a cloud backup is not asked where', async () => {
    // Given a backup with no local default location
    localStorage.setItem('data-mode', 'cloud')
    householdRole.current = 'manager'
    const { container } = renderCard()

    // When the user picks it
    await uploadPayload(container, v15Payload('cloud_home'))

    // Then it is imported at once, with no location dialog
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByRole('heading', { name: 'Import into which location?' }),
    ).not.toBeInTheDocument()
  })
})
