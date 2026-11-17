import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { addItemToLocation, createItem, getItemStock } from '@/db/operations'
import type { LocationRole } from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import {
  asLocationRole,
  OTHER_LOCATION,
  resetRole,
} from '@/test/rolePermissions'
import { DEFAULT_LOCATION_ID } from '@/types'

// Households H5 task F.6: the item Stock tab follows the LOCATION role of the
// page being viewed, not the active location and not the household role.
//
// | Role at the viewed location | Stock form | Remove from location | Add to location |
// | viewer                      | read only  | no                   | no              |
// | participant                 | editable   | no                   | yes             |
// | organizer                   | editable   | yes                  | yes             |
//
// `removeItemFromLocation` asks `organizer` (H3a), and a refusal now shows a
// toast instead of an unhandled rejection.
//
// The pager has two pages: the active local location ('local') and a second
// one (`OTHER_LOCATION`) where each person has a DIFFERENT role
// (`asLocationRole`). A third location id has no role at all. So a page that
// read the active location's role for every page fails.
vi.mock('@/hooks/usePermissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/usePermissions')>()
  const { roleOverride } = await import('@/test/rolePermissions')
  return {
    ...real,
    usePermissions: () => {
      // The real hook always runs, so the hook order never changes
      const live = real.usePermissions()
      const role = roleOverride()
      return role ? real.permissionsFor(role) : live
    },
  }
})

// When set, `removeItemFromLocation` rejects with this error, the way the
// cloud mutation does when the server refuses.
let removeError: unknown = null
vi.mock('@/hooks/useItems', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/useItems')>()
  return {
    ...real,
    useRemoveItemFromLocation: () => {
      const hook = real.useRemoveItemFromLocation()
      return removeError
        ? { ...hook, mutateAsync: () => Promise.reject(removeError) }
        : hook
    },
  }
})

let queryClient: QueryClient

beforeEach(async () => {
  await Promise.all([
    db.items.clear(),
    db.itemStocks.clear(),
    db.inventoryLogs.clear(),
    db.cartItems.clear(),
    db.shoppingCarts.clear(),
  ])
  await db.locations.where('id').notEqual(DEFAULT_LOCATION_ID).delete()
  const now = new Date()
  await db.locations.put({
    id: OTHER_LOCATION,
    name: 'Cabin',
    order: 1,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  })
  sessionStorage.clear()
  localStorage.setItem('e2e-skip-onboarding', 'true')
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

afterEach(() => {
  resetRole()
  removeError = null
  localStorage.removeItem('e2e-skip-onboarding')
})

function renderStock(itemId: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/items/${itemId}/stock`],
    }),
    context: { queryClient },
  })
  render(
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>,
  )
}

const VIEW_ONLY_NOTE = 'You can view this location, but not change it.'

/** Milk stocked here (3 packs) and at the Cabin. */
async function makeMilk() {
  const milk = await createItem({
    name: 'Milk',
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 3,
    unpackedQuantity: 0,
  })
  await addItemToLocation(milk.id, OTHER_LOCATION)
  return milk
}

const people: { who: string; role: LocationRole }[] = [
  { who: 'location viewer', role: 'viewer' },
  { who: 'location participant', role: 'participant' },
  { who: 'location organizer', role: 'organizer' },
]

describe.each(people)('$who on the Stock tab', ({ who, role }) => {
  const canEdit = role !== 'viewer'
  const isOrganizer = role === 'organizer'

  it(`${who} ${canEdit ? 'can' : 'cannot'} edit the stock of that location`, async () => {
    const milk = await makeMilk()
    asLocationRole(role)
    renderStock(milk.id)

    // Present first: this location's packed quantity
    const packed = await screen.findByLabelText(/^packed/i)
    expect(packed).toHaveValue(3)
    const save = screen.queryByRole('button', { name: /^save$/i })
    const more = screen.getByRole('button', {
      name: /increase packed/i,
    })
    if (canEdit) {
      expect(packed).not.toHaveAttribute('readonly')
      expect(save).toBeInTheDocument()
      expect(more).toBeEnabled()
      expect(screen.queryByText(VIEW_ONLY_NOTE)).toBeNull()
    } else {
      // readOnly, not disabled: the number can still be selected
      expect(packed).toHaveAttribute('readonly')
      expect(save).toBeNull()
      expect(more).toBeDisabled()
      expect(screen.getByRole('button', { name: /^unpack$/i })).toBeDisabled()
      expect(screen.getByText(VIEW_ONLY_NOTE)).toBeInTheDocument()
    }
  })

  it(`${who} ${isOrganizer ? 'sees' : 'does not see'} Remove from location`, async () => {
    const milk = await makeMilk()
    asLocationRole(role)
    renderStock(milk.id)

    expect(await screen.findByLabelText(/^packed/i)).toBeInTheDocument()
    const remove = screen.queryByRole('button', {
      name: /remove from location/i,
    })
    if (isOrganizer) expect(remove).toBeInTheDocument()
    else expect(remove).toBeNull()
  })
})

describe('the Stock tab follows the role of the page being viewed', () => {
  it('location viewer of the active location can edit the stock of a location where they are a participant', async () => {
    // Given a viewer here, and a participant at the Cabin
    const milk = await makeMilk()
    asLocationRole('viewer')
    renderStock(milk.id)
    expect(await screen.findByLabelText(/^packed/i)).toHaveAttribute('readonly')

    // When they page to the Cabin
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then that page is editable
    await waitFor(() =>
      expect(screen.getByLabelText(/^packed/i)).not.toHaveAttribute('readonly'),
    )
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })

  it('location organizer of the active location sees the view-only note and no Remove on a page where they are a viewer', async () => {
    // Given Milk stocked here and at the Cabin. This person organizes the
    // active location and is only a viewer at the Cabin (`asLocationRole`).
    // So the note and Remove give different answers on the two pages, and a
    // check that read the ACTIVE location's role on every page would fail.
    const milk = await makeMilk()
    asLocationRole('organizer')
    renderStock(milk.id)

    // On the active location: Remove, and no note
    expect(await screen.findByLabelText(/^packed/i)).not.toHaveAttribute(
      'readonly',
    )
    expect(
      screen.getByRole('button', { name: /remove from location/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(VIEW_ONLY_NOTE)).toBeNull()

    // When they page to the Cabin
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then the Cabin page shows the note and no Remove
    await waitFor(() =>
      expect(screen.getByLabelText(/^packed/i)).toHaveAttribute('readonly'),
    )
    expect(screen.getByText(VIEW_ONLY_NOTE)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /remove from location/i }),
    ).toBeNull()
  })

  it('location viewer of the active location sees the note here and not on a page where they are a participant', async () => {
    // Given a viewer here and a participant at the Cabin
    const milk = await makeMilk()
    asLocationRole('viewer')
    renderStock(milk.id)

    // Here: the note
    expect(await screen.findByText(VIEW_ONLY_NOTE)).toBeInTheDocument()

    // When they page to the Cabin
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then the Cabin page is editable and has no note
    await waitFor(() =>
      expect(screen.getByLabelText(/^packed/i)).not.toHaveAttribute('readonly'),
    )
    expect(screen.queryByText(VIEW_ONLY_NOTE)).toBeNull()
  })

  it(`location viewer does not see Add to location on a page where the item is not stocked`, async () => {
    // Given Bread stocked only at the Cabin, where this person is a
    // participant, and not here, where they are a viewer
    const bread = await createItem(
      { name: 'Bread', tagIds: [] },
      OTHER_LOCATION,
    )
    asLocationRole('viewer')
    renderStock(bread.id)

    // The tab opens on the active location: not stocked here
    expect(
      await screen.findByText(/not stocked/i, { selector: 'h2, h3, p' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /add to location/i }),
    ).toBeNull()
  })

  it('location participant sees Add to location on a page where the item is not stocked', async () => {
    // The control for the test above
    const bread = await createItem(
      { name: 'Bread', tagIds: [] },
      OTHER_LOCATION,
    )
    asLocationRole('participant')
    renderStock(bread.id)
    expect(
      await screen.findByRole('button', { name: /add to location/i }),
    ).toBeInTheDocument()
  })
})

describe('a refused removal', () => {
  it('user sees a message when removing from a location is refused', async () => {
    // Given the server refuses (another person changed the role meanwhile)
    const milk = await makeMilk()
    removeError = new CombinedGraphQLErrors({
      errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
    })
    asLocationRole('organizer')
    renderStock(milk.id)
    const user = userEvent.setup()

    // When the organizer removes Milk from here and confirms
    await user.click(
      await screen.findByRole('button', { name: /remove from location/i }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /remove/i }))

    // Then a message says it was refused, and the stock is still there
    expect(
      await screen.findByText(
        'Only an organizer of My Home can remove Milk from it.',
        { exact: false },
      ),
    ).toBeInTheDocument()
    expect(await getItemStock(milk.id, DEFAULT_LOCATION_ID)).toBeDefined()
  })

  it('user sees a general message when removing fails for another reason', async () => {
    const milk = await makeMilk()
    removeError = new Error('network down')
    asLocationRole('organizer')
    renderStock(milk.id)
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: /remove from location/i }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /remove/i }))

    expect(
      await screen.findByText(
        'Could not remove Milk from My Home. Please try again.',
      ),
    ).toBeInTheDocument()
  })
})
