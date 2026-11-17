import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import { cloudLocation, LOC_A } from '@/test/cloudFixtures'

// Households H5 task F.7, Review Focus case 3: a person whose location list
// is EMPTY. That is real since F.7: the household's last location can be
// deleted, and a member can be added with no location role.
//
// Before F.7, Pantry, Shopping and Cooking waited for `useCloudLocationKnown`
// forever, so they showed a spinner that never ended. Now each shows "You
// have no locations in this household yet." and Create a location, which
// opens the same Add Location dialog as the settings page.
//
// The location list is replaced here (`useLocations`), and so is the create
// (`useCreateLocation`), so the test can see what it is called with. Every
// other cloud hook keeps the stubs of src/test/setup.ts.

let locations: ReturnType<typeof cloudLocation>[] = []
const createLocation = vi.fn()

vi.mock('@/hooks/useLocations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/useLocations')>()
  return {
    ...real,
    useLocations: () => ({
      data: locations.map((l) => ({
        ...l,
        createdAt: new Date(l.createdAt),
        updatedAt: new Date(l.updatedAt),
      })),
      isLoading: false,
      isError: false,
    }),
    useCreateLocation: () => ({
      mutate: (name: string, options?: { onSuccess?: () => void }) => {
        createLocation(name)
        options?.onSuccess?.()
      },
      isPending: false,
    }),
  }
})

const EMPTY_TEXT = 'You have no locations in this household yet.'

let queryClient: QueryClient

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  localStorage.setItem('e2e-skip-onboarding', 'true')
  // A stale id, as after the last location was deleted on another device
  localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
  locations = []
  createLocation.mockReset()
  sessionStorage.clear()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  localStorage.removeItem('e2e-skip-onboarding')
  localStorage.removeItem(activeLocationStorageKey('cloud'))
})

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const pages = [
  { page: 'pantry', path: '/' },
  { page: 'shopping', path: '/shopping' },
  { page: 'cart', path: '/shopping/vendor-1' },
  { page: 'cooking', path: '/cooking' },
]

describe.each(pages)('the $page page with no locations', ({ path, page }) => {
  it(`user sees an empty ${page} screen with Create a location when they have no locations`, async () => {
    // Given the household has no location the caller can see
    renderAt(path)

    // Then the page says so, in the main area, with the button
    const main = await screen.findByRole('main')
    expect(await within(main).findByText(EMPTY_TEXT)).toBeInTheDocument()
    expect(
      within(main).getByRole('button', { name: 'Create a location' }),
    ).toBeInTheDocument()
    // And no spinner is left running
    expect(main.querySelector('.animate-spin')).toBeNull()
  })

  it(`user can create a location from the empty ${page} screen`, async () => {
    renderAt(path)
    const user = userEvent.setup()

    // When the user presses Create a location
    const main = await screen.findByRole('main')
    await user.click(
      await within(main).findByRole('button', { name: 'Create a location' }),
    )

    // Then the Add Location dialog opens, and Add creates it
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Add Location')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox'), 'Kitchen')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(createLocation).toHaveBeenCalledWith('Kitchen')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('with a location', () => {
  it('user with a location does not see the empty screen on the pantry', async () => {
    // Given one location with a role (the control for the tests above)
    locations = [cloudLocation(LOC_A, 'Kitchen', 0)]
    renderAt('/')

    // Present first: the switcher names the location, so the list the empty
    // screen reads has arrived too
    expect(
      (await screen.findAllByRole('button', { name: /current: Kitchen/ }))
        .length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull()
  })
})
