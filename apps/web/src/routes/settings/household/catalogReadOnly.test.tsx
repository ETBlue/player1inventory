import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  createRecipe,
  createShelf,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import {
  asHouseholdManager,
  asHouseholdMember,
  asRoleLoading,
  resetRole,
} from '@/test/rolePermissions'

// Households H5 task F.5: a household `member` sees the four catalog LIST
// pages (tags, vendors, recipes, shelves) with no add, edit, delete or drag.
//
// Every test runs twice, once per person, and the two people differ ONLY in
// the household role (`test/rolePermissions.ts`): both are a viewer of one
// location, a participant of another, and have no role on a third. So a page
// that hid the controls by a LOCATION role, or for everybody, fails one of
// the two runs. The manager run is the control that lets the member run fail.
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
    db.tags.clear(),
    db.tagTypes.clear(),
    db.vendors.clear(),
    db.recipes.clear(),
    db.shelves.clear(),
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

const READ_ONLY_NOTE =
  'Only a household owner or manager can add or change these.'

/** A member sees the read-only note above the list; a manager does not. */
function expectNote(main: HTMLElement, canEdit: boolean) {
  const note = within(main).queryByText(READ_ONLY_NOTE)
  if (canEdit) expect(note).toBeNull()
  else expect(note).toBeInTheDocument()
}

const people = [
  { who: 'household member', as: asHouseholdMember, canEdit: false },
  { who: 'household manager', as: asHouseholdManager, canEdit: true },
] as const

describe.each(people)('$who on the catalog list pages', (person) => {
  const sees = person.canEdit ? 'sees' : 'does not see'

  it(`${person.who} ${sees} add, edit, delete or drag on the tags page`, async () => {
    // Given a tag type with one tag
    const storage = await createTagType({ name: 'Storage' })
    await createTag({ name: 'Dairy', typeId: storage.id })
    person.as()

    // When the tags page shows the tag (present first, so an absence below
    // is not the loading state)
    renderAt('/settings/household/tags')
    const main = await screen.findByRole('main')
    expect((await within(main).findAllByText(/Dairy/)).length).toBeGreaterThan(
      0,
    )
    expectNote(main, person.canEdit)

    // Then the add, edit and delete controls follow the household role
    const controls = [
      within(main).queryByRole('button', { name: 'New Tag Type' }),
      within(main).queryByRole('button', { name: 'Edit' }),
      within(main).queryByRole('button', { name: 'Delete Storage' }),
      within(main).queryByRole('button', { name: 'New Tag' }),
      within(main).queryByRole('button', { name: 'Delete "Dairy"' }),
    ]
    for (const control of controls) {
      if (person.canEdit) expect(control).toBeInTheDocument()
      else expect(control).not.toBeInTheDocument()
    }
    // And so does dragging a tag to another type: a draggable badge points
    // at the drag instructions
    const draggable = main.querySelectorAll(
      '[aria-describedby="dnd-instructions"]',
    )
    expect(draggable).toHaveLength(person.canEdit ? 1 : 0)
  })

  it(`${person.who} ${sees} add or delete on the vendors page`, async () => {
    await createVendor('iHerb')
    person.as()

    renderAt('/settings/household/vendors')
    const main = await screen.findByRole('main')
    // The name renders as stored (vendor names keep their casing)
    expect(await within(main).findByText('iHerb')).toBeInTheDocument()
    expectNote(main, person.canEdit)

    const add = within(main).queryByRole('button', { name: 'New Vendor' })
    const del = within(main).queryByRole('button', { name: 'Delete "iHerb"' })
    for (const control of [add, del]) {
      if (person.canEdit) expect(control).toBeInTheDocument()
      else expect(control).not.toBeInTheDocument()
    }
    // A member still sees an empty state that does not tell them to create
    // one: checked on the empty page in the next test.
  })

  it(`${person.who} ${sees} add or delete on the recipes page`, async () => {
    await createRecipe({ name: 'Pancakes' })
    person.as()

    renderAt('/settings/household/recipes')
    const main = await screen.findByRole('main')
    expect(await within(main).findByText('Pancakes')).toBeInTheDocument()
    expectNote(main, person.canEdit)

    const add = within(main).queryByRole('button', { name: 'New Recipe' })
    const del = within(main).queryByRole('button', {
      name: 'Delete "Pancakes"',
    })
    for (const control of [add, del]) {
      if (person.canEdit) expect(control).toBeInTheDocument()
      else expect(control).not.toBeInTheDocument()
    }
  })

  it(`${person.who} ${sees} add, delete or drag handles on the shelves page`, async () => {
    await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [],
    })
    person.as()

    renderAt('/settings/household/shelves')
    const main = await screen.findByRole('main')
    expect(await within(main).findByText('Fridge')).toBeInTheDocument()
    expectNote(main, person.canEdit)

    const controls = [
      within(main).queryByRole('button', { name: 'Add shelf' }),
      within(main).queryByRole('button', { name: 'Delete Fridge' }),
      within(main).queryByRole('button', { name: 'Drag to reorder Fridge' }),
    ]
    for (const control of controls) {
      if (person.canEdit) expect(control).toBeInTheDocument()
      else expect(control).not.toBeInTheDocument()
    }
  })
})

describe('household member on an empty catalog list', () => {
  it.each([
    ['/settings/household/vendors', 'No vendors yet'],
    ['/settings/household/recipes', 'No recipes yet'],
  ])('household member is not told to create anything on %s', async (path, title) => {
    // Given no rows, and a member, who may not add one
    asHouseholdMember()
    renderAt(path)
    const main = await screen.findByRole('main')

    // Then the empty state shows, without "Create your first …"
    expect(await within(main).findByText(title)).toBeInTheDocument()
    expect(within(main).queryByText(/create your first/i)).toBeNull()
    expect(
      within(main).getByText(
        'Only a household owner or manager can add or change these.',
      ),
    ).toBeInTheDocument()
  })

  it('household manager is still told to create the first vendor', async () => {
    // The control for the test above
    asHouseholdManager()
    renderAt('/settings/household/vendors')
    const main = await screen.findByRole('main')
    expect(
      await within(main).findByText('Create your first vendor to get started!'),
    ).toBeInTheDocument()
  })
})

describe('while the household role loads', () => {
  it('user sees neither write controls nor the read-only note yet', async () => {
    // Given an owner whose role has not loaded: nothing may be offered yet,
    // and the page must not claim the list is read-only either
    await createVendor('iHerb')
    asRoleLoading()
    renderAt('/settings/household/vendors')
    const main = await screen.findByRole('main')
    expect(await within(main).findByText('iHerb')).toBeInTheDocument()

    expect(
      within(main).queryByRole('button', { name: 'New Vendor' }),
    ).toBeNull()
    expect(within(main).queryByText(READ_ONLY_NOTE)).toBeNull()
  })
})
