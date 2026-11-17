import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import {
  asHouseholdManager,
  asHouseholdMember,
  resetRole,
} from '@/test/rolePermissions'

// Households H5 task F.5: creating a recipe is a catalog write. On the
// cooking page a household `member` gets no "Create recipe" in the empty
// state and no "Create" from search (button or Enter). Cooking itself is a
// LOCATION right (task F.6) and is not touched here.
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
    db.recipes.clear(),
  ])
  sessionStorage.clear()
  localStorage.setItem('e2e-skip-onboarding', 'true')
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

afterEach(() => {
  resetRole()
  localStorage.removeItem('e2e-skip-onboarding')
})

function renderCooking() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/cooking'] }),
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

const people = [
  { who: 'household member', as: asHouseholdMember, canEdit: false },
  { who: 'household manager', as: asHouseholdManager, canEdit: true },
] as const

describe.each(people)('$who on the cooking page', (person) => {
  const verb = person.canEdit ? 'sees' : 'does not see'

  it(`${person.who} ${verb} Create recipe on the empty cooking page`, async () => {
    // Given no recipes (one item, so the app does not open onboarding)
    await createItem({ name: 'Milk', tagIds: [] })
    person.as()
    renderCooking()

    // Present first: the empty state
    expect(await screen.findByText('No recipes yet')).toBeInTheDocument()
    const create = screen.queryByRole('button', { name: 'Create recipe' })
    const invite = screen.queryByText(
      'Create your first recipe to get started!',
    )
    if (person.canEdit) {
      expect(create).toBeInTheDocument()
      expect(invite).toBeInTheDocument()
    } else {
      expect(create).toBeNull()
      // And it does not tell a member to create one
      expect(invite).toBeNull()
      expect(
        screen.getByText(
          'Only a household owner or manager can add or change these.',
        ),
      ).toBeInTheDocument()
    }
  })

  it(`${person.who} ${verb} Create when a recipe search finds nothing`, async () => {
    await createRecipe({ name: 'Pasta' })
    person.as()
    renderCooking()
    expect(await screen.findByText('Pasta')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /toggle search/i }))
    await user.type(screen.getByPlaceholderText(/search recipes/i), 'Pizza')

    // The Clear button shows for everyone (present first)
    expect(
      await screen.findByRole('button', { name: /clear search/i }),
    ).toBeInTheDocument()
    const create = screen.queryByRole('button', { name: /^create$/i })
    if (person.canEdit) {
      expect(create).toBeInTheDocument()
    } else {
      expect(create).toBeNull()
      // And Enter opens no "New recipe" dialog
      await user.keyboard('{Enter}')
      expect(screen.queryByRole('dialog')).toBeNull()
    }
  })
})
