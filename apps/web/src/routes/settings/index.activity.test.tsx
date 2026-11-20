import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import type { HouseholdRole } from '@/generated/graphql'
import { type Permissions, permissionsFor } from '@/hooks/usePermissions'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { mockScreen } from '@/test/viewport'

// The Activity card of the mobile /settings accordion (households H6, task
// J.6). It shows to a household owner or manager in cloud mode only, as the
// eighth household link, after Tags.

const perms = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/hooks/usePermissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePermissions')>()
  return { ...actual, usePermissions: () => perms.current as Permissions }
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  mockScreen({ desktop: false })
  vi.stubEnv('VITE_E2E_TEST_USER_ID', '')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  localStorage.removeItem('data-mode')
})

async function householdLinks(mode: 'local' | 'cloud', role?: HouseholdRole) {
  localStorage.setItem('data-mode', mode)
  perms.current = permissionsFor({ mode, householdRole: role })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
    context: { queryClient },
  })
  render(
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>,
  )
  const main = await screen.findByRole('main')
  const general = await within(main).findByRole('link', { name: /General/ })
  const region = general.closest('[role="region"]') as HTMLElement
  return {
    region,
    hrefs: within(region)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href')),
  }
}

describe('Settings accordion — the Activity card', () => {
  it.each([
    'owner',
    'manager',
  ] as const)('household %s in cloud mode sees Activity eighth, after Tags', async (role) => {
    const { region, hrefs } = await householdLinks('cloud', role)
    expect(hrefs).toEqual([
      '/settings/household',
      '/settings/household/members',
      '/settings/household/locations',
      '/settings/household/shelves',
      '/settings/household/vendors',
      '/settings/household/recipes',
      '/settings/household/tags',
      '/settings/household/activity',
    ])
    expect(
      within(region).getByRole('link', { name: /Activity/ }),
    ).toHaveTextContent('Who changed what in this household')
  })

  it('household member does not see Activity', async () => {
    const { hrefs } = await householdLinks('cloud', 'member')
    expect(hrefs).toContain('/settings/household/members')
    expect(hrefs).not.toContain('/settings/household/activity')
  })

  it('user in local mode does not see Activity', async () => {
    const { hrefs } = await householdLinks('local')
    expect(hrefs).toHaveLength(6)
    expect(hrefs).not.toContain('/settings/household/activity')
  })
})
