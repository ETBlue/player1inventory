import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
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
  asRoleLoading,
  asRoleUnknown,
  resetRole,
} from '@/test/rolePermissions'

// Households H5, review of task F.5: what the catalog Info pages do while the
// household role is not known yet, and when it cannot be read at all.
//
// 1. The role ARRIVES after the page has opened. The name field has
//    `autoFocus={!readOnly}`. If the form were mounted read-only while the
//    role loads, React would never focus it later, so an owner would lose
//    the autofocus. The pages wait for the role before they mount the form.
// 2. `GetHousehold` failed with nothing cached. The form is read only (the
//    safe default), but the page must not say "Only a household owner or
//    manager can change this." to what may be an owner.
//
// This file's mock uses `useRoleOverride`, so a role change in `act(...)`
// renders the page again, the way a real `GetHousehold` answer would.
vi.mock('@/hooks/usePermissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/usePermissions')>()
  const { useRoleOverride } = await import('@/test/rolePermissions')
  return {
    ...real,
    usePermissions: () => {
      // The real hook always runs, so the hook order never changes
      const live = real.usePermissions()
      const role = useRoleOverride()
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

/** Each Info page whose name field has `autoFocus={!readOnly}`. */
const pages = [
  {
    page: 'tag',
    seed: async () => {
      const type = await createTagType({ name: 'Storage' })
      const tag = await createTag({ name: 'Dairy', typeId: type.id })
      return { path: `/settings/household/tags/${tag.id}`, name: 'Dairy' }
    },
  },
  {
    page: 'vendor',
    seed: async () => {
      const vendor = await createVendor('iHerb')
      return { path: `/settings/household/vendors/${vendor.id}`, name: 'iHerb' }
    },
  },
  {
    page: 'recipe',
    seed: async () => {
      const recipe = await createRecipe({ name: 'Pancakes' })
      return {
        path: `/settings/household/recipes/${recipe.id}`,
        name: 'Pancakes',
      }
    },
  },
] as const

describe.each(pages)('the $page Info page', ({ page, seed }) => {
  it(`household manager gets the focus in the ${page} name once the role has loaded`, async () => {
    // Given the role is still loading when the page opens
    const { path, name } = await seed()
    asRoleLoading()
    renderAt(path)
    const main = await screen.findByRole('main')
    // Wait until the page has its data: the title shows the name. The Info
    // tab reads the same query, so from here on only the role is missing.
    expect((await within(main).findAllByText(name)).length).toBeGreaterThan(0)
    // The tag Info tab also waits for the tag types
    if (page === 'tag') {
      await waitFor(() =>
        expect(queryClient.getQueryData(['tagTypes'])).toBeDefined(),
      )
    }

    // When the role arrives: a manager
    act(() => asHouseholdManager())

    // Then the name field is editable AND has the focus
    const input = await within(main).findByDisplayValue(name)
    expect(input).not.toHaveAttribute('readonly')
    expect(input).toHaveFocus()
  })

  it(`household member does not get the focus in the ${page} name`, async () => {
    // The control: the same arrival, but a member, whose field is read only
    const { path, name } = await seed()
    asRoleLoading()
    renderAt(path)
    const main = await screen.findByRole('main')
    expect((await within(main).findAllByText(name)).length).toBeGreaterThan(0)

    act(() => asHouseholdMember())

    const input = await within(main).findByDisplayValue(name)
    expect(input).toHaveAttribute('readonly')
    expect(input).not.toHaveFocus()
    expect(within(main).getByText(DETAIL_NOTE)).toBeInTheDocument()
  })

  it(`user whose household role cannot be read sees the ${page} read only, with no member note`, async () => {
    const { path, name } = await seed()
    asRoleUnknown()
    renderAt(path)
    const main = await screen.findByRole('main')

    // Present first: the form
    const input = await within(main).findByDisplayValue(name)
    // The safe default: nothing can be changed
    expect(input).toHaveAttribute('readonly')
    expect(within(main).queryByRole('button', { name: /^save$/i })).toBeNull()
    expect(within(main).queryByRole('button', { name: /^delete/i })).toBeNull()
    // And no claim about the role
    expect(within(main).queryByText(DETAIL_NOTE)).toBeNull()
  })
})

describe('the Add Tag dialog', () => {
  it('household manager gets the focus in the new tag name', async () => {
    // A guard: the dialog opens only for someone who can edit (its button
    // is hidden otherwise), so its form is never read only. It must keep the
    // focus.
    await createTagType({ name: 'Storage' })
    asHouseholdManager()
    renderAt('/settings/household/tags')
    const main = await screen.findByRole('main')

    const user = userEvent.setup()
    await user.click(
      await within(main).findByRole('button', { name: 'New Tag' }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/name/i)).toHaveFocus()
  })
})
