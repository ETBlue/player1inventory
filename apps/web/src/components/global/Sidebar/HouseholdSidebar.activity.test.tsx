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
import { HouseholdSidebar } from './HouseholdSidebar'

// The Activity item of the household sidebar (households H6, task J.6). It
// shows to a household owner or manager in cloud mode only, as item 8, after
// Tags. The role reaches the sidebar through `usePermissions`, set here with
// the app's own rules (`permissionsFor`).

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

async function linkHrefs() {
  const nav = await screen.findByRole('navigation')
  await within(nav).findByRole('link', { name: 'General' })
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'))
}

afterEach(() => {
  cleanup()
  localStorage.removeItem('data-mode')
})

describe('HouseholdSidebar — the Activity item', () => {
  it.each([
    'owner',
    'manager',
  ] as const)('household %s in cloud mode sees Activity eighth, after Tags', async (role) => {
    renderAs('cloud', role)
    expect(await linkHrefs()).toEqual([
      '/settings/household',
      '/settings/household/members',
      '/settings/household/locations',
      '/settings/household/shelves',
      '/settings/household/vendors',
      '/settings/household/recipes',
      '/settings/household/tags',
      '/settings/household/activity',
    ])
    expect(screen.getByRole('link', { name: 'Activity' })).toBeInTheDocument()
  })

  it('household member does not see Activity', async () => {
    renderAs('cloud', 'member')
    // Present first: the list has rendered, Members included
    expect(await linkHrefs()).toContain('/settings/household/members')
    expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull()
  })

  it('user in local mode does not see Activity', async () => {
    renderAs('local')
    expect(await linkHrefs()).toHaveLength(6)
    expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull()
  })
})
