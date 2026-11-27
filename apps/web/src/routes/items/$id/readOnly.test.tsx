import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  createItem,
  createRecipe,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import {
  asHouseholdManager,
  asHouseholdMember,
  asRoleUnknown,
  resetRole,
} from '@/test/rolePermissions'

// Households H5 task F.5: a household `member` sees the item page's catalog
// fields read only. The Info tab's fields are `readOnly` with no Save and no
// Delete; the Tags, Vendors and Recipes tabs show what is assigned but a
// press writes nothing, and there is no "New …" button. The Stock tab is NOT
// a catalog page: it follows the LOCATION role (task F.6), so a member who
// is a participant of the active location keeps it.
//
// Both people are a participant of the active local location, a viewer of
// another, and have no role on a third (`test/rolePermissions.ts`). They
// differ only in the household role.
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

let queryClient: QueryClient

beforeEach(async () => {
  await Promise.all([
    db.items.clear(),
    db.itemStocks.clear(),
    db.tags.clear(),
    db.tagTypes.clear(),
    db.vendors.clear(),
    db.recipes.clear(),
  ])
  sessionStorage.clear()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

afterEach(() => {
  resetRole()
})

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
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

function makeMilk(extra: Record<string, unknown> = {}) {
  return createItem({
    name: 'Milk',
    packageUnit: 'bottle',
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 2,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
    vendorIds: [],
    ...extra,
  })
}

const ITEM_NOTE = 'Only a household owner or manager can change this.'

const people = [
  { who: 'household member', as: asHouseholdMember, canEdit: false },
  { who: 'household manager', as: asHouseholdManager, canEdit: true },
] as const

describe.each(people)('$who on the item page', (person) => {
  const sees = person.canEdit ? 'can edit' : 'sees read only'

  it(`${person.who} ${sees} the item's Info tab`, async () => {
    const milk = await makeMilk()
    person.as()
    renderAt(`/items/${milk.id}`)
    const main = await screen.findByRole('main')

    // Present first: the name is in its field
    const name = await within(main).findByDisplayValue('Milk')
    const save = within(main).queryByRole('button', { name: /^save$/i })
    const del = within(main).queryByRole('button', { name: /^delete$/i })
    const note = within(main).queryByText(ITEM_NOTE)
    const unitSwitch = within(main).getByRole('switch', {
      name: /track in measurement/i,
    })
    const consumableSwitch = within(main).getByRole('switch', {
      name: /^consumable$/i,
    })
    if (person.canEdit) {
      expect(name).not.toHaveAttribute('readonly')
      expect(save).toBeInTheDocument()
      expect(del).toBeInTheDocument()
      expect(note).toBeNull()
      expect(unitSwitch).not.toBeDisabled()
      expect(consumableSwitch).not.toBeDisabled()
    } else {
      // readOnly, not disabled: the text can still be selected
      expect(name).toHaveAttribute('readonly')
      expect(name).not.toBeDisabled()
      expect(save).toBeNull()
      expect(del).toBeNull()
      expect(note).toBeInTheDocument()
      expect(unitSwitch).toBeDisabled()
      expect(consumableSwitch).toBeDisabled()
    }
  })

  it.each([
    {
      tab: 'vendors',
      seed: async () => {
        await createVendor('iHerb')
      },
      badge: /iHerb/,
      newButton: 'New Vendor',
      stored: async (id: string) => (await db.items.get(id))?.vendorIds ?? [],
      hasSave: true,
    },
    {
      tab: 'tags',
      seed: async () => {
        const type = await createTagType({ name: 'Storage' })
        await createTag({ name: 'Dairy', typeId: type.id })
      },
      badge: /Dairy/,
      newButton: 'New Tag',
      stored: async (id: string) => (await db.items.get(id))?.tagIds ?? [],
      // Since the item relations Save a press changes only the screen, and
      // the top bar Save writes it
      hasSave: true,
    },
    {
      tab: 'recipes',
      seed: async () => {
        await createRecipe({ name: 'Pancakes' })
      },
      badge: /Pancakes/,
      newButton: 'New Recipe',
      stored: async (id: string) =>
        (await db.recipes.toArray()).flatMap((r) =>
          r.items.filter((ri) => ri.itemId === id),
        ),
    },
  ])(`${person.who} on the item's $tab tab ${person.canEdit ? 'can' : 'cannot'} change it`, async ({
    tab,
    seed,
    badge,
    newButton,
    stored,
    ...rest
  }) => {
    const hasSave = 'hasSave' in rest && rest.hasSave
    // Given Milk, and one row it is not assigned to
    await seed()
    const milk = await makeMilk()
    person.as()
    renderAt(`/items/${milk.id}/${tab}`)
    const main = await screen.findByRole('main')

    // Present first: the row's badge
    const row = await within(main).findByRole('button', { name: badge })
    expect(row).toHaveAttribute('aria-pressed', 'false')

    // The "New …" button follows the household role
    const add = within(main).queryByRole('button', { name: newButton })
    if (person.canEdit) expect(add).toBeInTheDocument()
    else expect(add).toBeNull()

    // When the person presses the badge (and Save, on a tab that has one)
    const user = userEvent.setup()
    await user.click(row)
    const save = within(main).queryByRole('button', { name: /^save$/i })
    if (hasSave && person.canEdit) {
      expect(save).toBeEnabled()
      await user.click(save as HTMLElement)
    }

    // Then only a manager's press assigns it
    if (person.canEdit) {
      await vi.waitFor(async () =>
        expect(await stored(milk.id)).toHaveLength(1),
      )
    } else {
      // A member gets no Save, and the press changes nothing on screen
      expect(save).toBeNull()
      expect(row).toHaveAttribute('aria-disabled', 'true')
      expect(row).toHaveAttribute('aria-pressed', 'false')
      expect(row).not.toHaveAttribute('tabindex')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(await stored(milk.id)).toHaveLength(0)
    }
  })

  it(`${person.who} who is a participant of the active location still edits its stock`, async () => {
    // A guard, not a catalog rule: the Stock tab must NOT follow the
    // household role. It goes red if someone hides it by `canEditCatalog`.
    const milk = await makeMilk()
    person.as()
    renderAt(`/items/${milk.id}/stock`)

    const packed = await screen.findByLabelText(/^packed/i)
    expect(packed).not.toHaveAttribute('readonly')
    expect(packed).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })
})

describe('when the household role cannot be read', () => {
  it("user sees the item's Info tab read only, with no member note", async () => {
    // Given GetHousehold failed: the safe default is read only, but the page
    // must not tell what may be an owner that only an owner can change it
    const milk = await makeMilk()
    asRoleUnknown()
    renderAt(`/items/${milk.id}`)
    const main = await screen.findByRole('main')

    const name = await within(main).findByDisplayValue('Milk')
    expect(name).toHaveAttribute('readonly')
    expect(within(main).queryByRole('button', { name: /^save$/i })).toBeNull()
    expect(within(main).queryByText(ITEM_NOTE)).toBeNull()
  })
})
