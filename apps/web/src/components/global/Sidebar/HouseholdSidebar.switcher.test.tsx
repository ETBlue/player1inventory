import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdRole } from '@/generated/graphql'
import { type Permissions, permissionsFor } from '@/hooks/usePermissions'
import { elementAt } from '@/test/narrow'
import { HouseholdSidebar } from './HouseholdSidebar'

// Item 9 of the household sidebar, **Switch to…** (households H7 task L.4).
// It shows in cloud mode for EVERY household role, last, after the links,
// and not in local mode. The role reaches the sidebar through
// `usePermissions`, set here with the app's own rules (`permissionsFor`), the
// same way `HouseholdSidebar.activity.test.tsx` does. `src/test/setup.ts`
// stubs `useMyHouseholdsQuery` with no data; the menu itself is tested in
// `components/household/HouseholdSwitcher/HouseholdSwitcher.test.tsx`.

const perms = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/hooks/usePermissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePermissions')>()
  return { ...actual, usePermissions: () => perms.current as Permissions }
})

function renderAs(mode: 'local' | 'cloud', householdRole?: HouseholdRole) {
  localStorage.setItem('data-mode', mode)
  perms.current = permissionsFor({ mode, householdRole })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <nav aria-label="Sidebar navigation">
          <HouseholdSidebar />
        </nav>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/settings/household'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.removeItem('data-mode')
})

describe('HouseholdSidebar — Switch to…', () => {
  it.each([
    'owner',
    'manager',
    'member',
  ] as const)('household %s in cloud mode sees Switch to… after the last link', async (role) => {
    renderAs('cloud', role)
    const nav = await screen.findByRole('navigation')
    const links = await within(nav).findAllByRole('link')
    const lastLink = elementAt(links, links.length - 1)

    const switcher = within(nav).getByRole('button', { name: /Switch to…/ })
    expect(switcher).toHaveAttribute('aria-haspopup', 'menu')
    expect(
      lastLink.compareDocumentPosition(switcher) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('user in local mode does not see Switch to…', async () => {
    renderAs('local')
    const nav = await screen.findByRole('navigation')
    // Present first: the list has rendered
    await within(nav).findByRole('link', { name: 'General' })
    expect(within(nav).queryByRole('button', { name: /Switch to…/ })).toBeNull()
  })
})
