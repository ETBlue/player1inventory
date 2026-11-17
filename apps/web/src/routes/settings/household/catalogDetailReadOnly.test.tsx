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
  resetRole,
} from '@/test/rolePermissions'

// Households H5 task F.5: a household `member` sees the four catalog Info
// pages (tags, vendors, recipes, shelves) read only: the name input is
// `readOnly`, selects are disabled, and there is no Save and no Delete.
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

const DETAIL_NOTE = 'Only a household owner or manager can change this.'

const people = [
  { who: 'household member', as: asHouseholdMember, canEdit: false },
  { who: 'household manager', as: asHouseholdManager, canEdit: true },
] as const

/** The Save and Delete buttons, the note, and the name input's readOnly. */
function expectDetailControls(
  main: HTMLElement,
  nameInput: HTMLElement,
  canEdit: boolean,
  deleteName: RegExp = /^delete/i,
) {
  const save = within(main).queryByRole('button', { name: /^save$/i })
  const del = within(main).queryByRole('button', { name: deleteName })
  const note = within(main).queryByText(DETAIL_NOTE)
  if (canEdit) {
    expect(save).toBeInTheDocument()
    expect(del).toBeInTheDocument()
    expect(note).toBeNull()
    expect(nameInput).not.toHaveAttribute('readonly')
  } else {
    expect(save).toBeNull()
    expect(del).toBeNull()
    expect(note).toBeInTheDocument()
    // readOnly, not disabled: the text can still be selected and copied
    expect(nameInput).toHaveAttribute('readonly')
    expect(nameInput).not.toBeDisabled()
  }
}

describe.each(people)('$who on the catalog Info pages', (person) => {
  const sees = person.canEdit ? 'can edit' : 'sees read only'

  it(`${person.who} ${sees} a vendor's Info page`, async () => {
    const vendor = await createVendor('iHerb')
    person.as()
    renderAt(`/settings/household/vendors/${vendor.id}`)
    const main = await screen.findByRole('main')
    const name = await within(main).findByDisplayValue('iHerb')
    expectDetailControls(main, name, person.canEdit)
  })

  it(`${person.who} ${sees} a recipe's Info page`, async () => {
    const recipe = await createRecipe({ name: 'Pancakes' })
    person.as()
    renderAt(`/settings/household/recipes/${recipe.id}`)
    const main = await screen.findByRole('main')
    const name = await within(main).findByDisplayValue('Pancakes')
    expectDetailControls(main, name, person.canEdit)
  })

  it(`${person.who} ${sees} a shelf's Info page`, async () => {
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [],
    })
    person.as()
    renderAt(`/settings/household/shelves/${shelf.id}`)
    const main = await screen.findByRole('main')
    const name = await within(main).findByDisplayValue('Fridge')
    expectDetailControls(main, name, person.canEdit)
  })

  it(`${person.who} ${sees} a tag's Info page, with the type and parent fixed`, async () => {
    const storage = await createTagType({ name: 'Storage' })
    const tag = await createTag({ name: 'Dairy', typeId: storage.id })
    person.as()
    renderAt(`/settings/household/tags/${tag.id}`)
    const main = await screen.findByRole('main')
    const name = await within(main).findByDisplayValue('Dairy')
    expectDetailControls(main, name, person.canEdit)
    // A select cannot be readOnly, so a member's two selects are disabled
    const selects = within(main).getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    for (const select of selects) {
      if (person.canEdit) expect(select).not.toBeDisabled()
      else expect(select).toBeDisabled()
    }
  })
})
