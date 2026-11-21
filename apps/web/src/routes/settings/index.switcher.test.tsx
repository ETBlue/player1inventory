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
import { elementAt } from '@/test/narrow'
import { mockScreen } from '@/test/viewport'

// The ninth household item of the mobile /settings accordion, **Switch to…**
// (households H7 task L.4; design, *Mobile*: "9 opens the dropdown"). It is a
// button, not a link, last in the household region. It shows in cloud mode
// for EVERY household role, and not in local mode. `src/test/setup.ts` stubs
// `useMyHouseholdsQuery` with no data; the menu is tested in
// `components/household/HouseholdSwitcher/HouseholdSwitcher.test.tsx`.

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

async function householdRegion(mode: 'local' | 'cloud', role?: HouseholdRole) {
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
  return region
}

describe('Settings accordion — Switch to…', () => {
  it.each([
    'owner',
    'manager',
    'member',
  ] as const)('household %s in cloud mode sees Switch to… after the last household link', async (role) => {
    const region = await householdRegion('cloud', role)
    const links = within(region).getAllByRole('link')
    const lastLink = elementAt(links, links.length - 1)

    const switcher = within(region).getByRole('button', {
      name: 'Switch to… Move to another household, or create one',
    })
    expect(switcher).toHaveAttribute('aria-haspopup', 'menu')
    expect(
      lastLink.compareDocumentPosition(switcher) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('user in local mode does not see Switch to…', async () => {
    const region = await householdRegion('local')
    // Present first: the links have rendered
    expect(within(region).getAllByRole('link')).toHaveLength(6)
    expect(
      within(region).queryByRole('button', { name: /Switch to…/ }),
    ).toBeNull()
  })
})
