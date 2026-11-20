import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { LAST_HOUSEHOLD_ID_KEY } from '@/apollo/householdGuard'
import {
  BootstrapCartsDocument,
  GetHouseholdDocument,
  GetLocationsDocument,
  type HouseholdRole,
} from '@/generated/graphql'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'

// A REAL page, in cloud mode, for a person with a given household role
// (households H5 task F.5). Used by the `MemberReadOnly` page stories.
//
// The role reaches the page the way it does in the app: `GetHousehold`
// answers it, and `usePermissions` reads it. The caller adds the mocks for
// the page's own data. A query nobody mocked fails, which the page shows as
// "no rows"; that is fine for a story about which buttons are shown.
//
// Fixtures stay module-local in each story file (a named export in a
// `.stories.tsx` becomes a broken story). This module exports no story.

/** The one location every role story is active at. */
export const ROLE_STORY_LOCATION = 'clw3rolestory0a00s9f8h7g6d5'

/** The household id `cloudRoleBaseMocks` answers. */
const ROLE_STORY_HOUSEHOLD = 'household-role-story'

/** The mocks every page needs, for a person with `householdRole`. */
export function cloudRoleBaseMocks(
  householdRole: HouseholdRole,
): NonNullable<MockedProviderProps['mocks']> {
  return [
    {
      request: { query: GetHouseholdDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          household: {
            __typename: 'Household',
            id: ROLE_STORY_HOUSEHOLD,
            name: 'The Lin home',
            role: householdRole,
            hasOwner: true,
            pendingTransfer: null,
          },
        },
      },
    },
    {
      request: { query: GetLocationsDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          locations: [
            {
              __typename: 'Location',
              id: ROLE_STORY_LOCATION,
              name: 'Kitchen',
              order: 0,
              createdAt: '2026-11-01T00:00:00.000Z',
              updatedAt: '2026-11-01T00:00:00.000Z',
              myRole: 'participant',
            },
          ],
        },
      },
    },
    {
      request: {
        query: BootstrapCartsDocument,
        variables: { locationId: ROLE_STORY_LOCATION },
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: { data: { bootstrapCarts: [] } },
    },
  ]
}

/**
 * A story's `beforeEach`: cloud mode, active at `ROLE_STORY_LOCATION`.
 *
 * It also stores the story household as the device's last household. Without
 * it, a story household that differs from one stored by an earlier story
 * would make `HouseholdChangeGuard` clear the cache and RELOAD the Storybook
 * page (households H5b, decision T23).
 */
export function cloudRoleStorySetup() {
  localStorage.setItem('data-mode', 'cloud')
  localStorage.setItem('e2e-skip-onboarding', 'true')
  localStorage.setItem(activeLocationStorageKey('cloud'), ROLE_STORY_LOCATION)
  localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, ROLE_STORY_HOUSEHOLD)
  return () => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem('e2e-skip-onboarding')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
    localStorage.removeItem(LAST_HOUSEHOLD_ID_KEY)
  }
}

export function CloudRolePage({
  path,
  householdRole,
  mocks,
}: {
  path: string
  householdRole: HouseholdRole
  mocks: NonNullable<MockedProviderProps['mocks']>
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [router] = useState(() =>
    createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient },
    }),
  )
  return (
    <MockedProvider mocks={[...cloudRoleBaseMocks(householdRole), ...mocks]}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>
  )
}
