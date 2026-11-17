import { ApolloProvider } from '@apollo/client/react'
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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  InvitePreviewDocument,
  type InvitePreviewQuery,
  JoinHouseholdDocument,
} from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { cloudRoleBaseMocks, cloudRoleStorySetup } from '@/test/cloudRoleStory'

// The real generated hooks and Apollo React hooks, so `MockedProvider`
// answers the page. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// The household switch clears IndexedDB and reloads the page. The test only
// needs to know it was asked for, with which household.
const switchToHouseholdMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return { ...actual, switchToHousehold: switchToHouseholdMock }
})

const TOKEN = 'tok-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd'
const reloadMock = vi.fn()
const originalLocation = window.location

type Preview = InvitePreviewQuery['invitePreview']

const VALID: Preview = {
  __typename: 'InvitePreview',
  status: 'VALID',
  householdName: 'the Lin home',
  invitedByName: 'Mei Lin',
  householdRole: 'member',
  locationRoles: [
    {
      __typename: 'InviteLocationRole',
      locationId: 'loc-kitchen',
      locationName: 'my Kitchen',
      role: 'organizer',
    },
    {
      __typename: 'InviteLocationRole',
      locationId: 'loc-garage',
      locationName: 'Garage',
      role: 'viewer',
    },
  ],
}

function previewMock(preview: Preview) {
  return {
    request: { query: InvitePreviewDocument, variables: { token: TOKEN } },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { invitePreview: preview } },
  }
}

function joinRefusal(reason: string) {
  return {
    request: { query: JoinHouseholdDocument, variables: { token: TOKEN } },
    result: {
      errors: [
        { message: 'refused', extensions: { code: 'BAD_USER_INPUT', reason } },
      ],
    },
  }
}

function renderCloud(mocks: NonNullable<MockedProviderProps['mocks']>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/join/${TOKEN}`] }),
    context: { queryClient },
  })
  render(
    <MockedProvider mocks={[...cloudRoleBaseMocks('owner'), ...mocks]}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>,
  )
  return router
}

function renderLocal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/join/${TOKEN}`] }),
    context: { queryClient },
  })
  render(
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>,
  )
  return router
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadMock },
    writable: true,
    configurable: true,
  })
})

afterEach(async () => {
  // Unmount first: a mounted page still reads Dexie, which the delete below
  // closes.
  cleanup()
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
  reloadMock.mockReset()
  switchToHouseholdMock.mockClear()
  vi.restoreAllMocks()
  localStorage.clear()
  await db.delete()
  await db.open()
})

describe('join page, local mode', () => {
  it('user with no data who opens an invite link in local mode stays on the join page', async () => {
    // Given a brand-new visitor: local mode (the default), an empty
    // database, and no onboarding skip flag (Review Focus 1, decision T25)
    localStorage.removeItem('e2e-skip-onboarding')

    // When they open the invite link
    const router = renderLocal()

    // Then they see why joining needs cloud sync, and a way to sign in
    expect(
      await screen.findByRole('button', { name: 'Sign in to join' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Joining a household uses cloud sync. Your data on this device stays here and is not copied.',
      ),
    ).toBeInTheDocument()
    // And the empty catalog does not send them to onboarding. The redirect
    // waits for the three catalog reads, so give them time to finish
    await new Promise((r) => setTimeout(r, 100))
    expect(router.state.location.pathname).toBe(`/join/${TOKEN}`)
  })

  it('user can switch to cloud from the join page without copying local data', async () => {
    // Given local mode with one local item
    await db.items.add({
      id: 'local-item',
      name: 'milk',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
    const user = userEvent.setup()
    renderLocal()

    // When they press Sign in to join
    await user.click(
      await screen.findByRole('button', { name: 'Sign in to join' }),
    )

    // Then the app switches to cloud and reloads
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    expect(reloadMock).toHaveBeenCalledOnce()
    // And no copy of local data is started or offered after sign-in:
    // `migration-strategy` would start a copy, and without
    // `migration-prompted` the dialog would ask to copy the local item
    expect(localStorage.getItem('migration-strategy')).toBeNull()
    expect(localStorage.getItem('migration-prompted')).toBe('1')
    // And the local data is still there
    expect(await db.items.count()).toBe(1)
  })
})

describe('join page, cloud mode', () => {
  beforeEach(() => {
    cloudRoleStorySetup()
  })

  it('user sees who invited them, the household and their roles', async () => {
    // Given a valid invite
    renderCloud([previewMock(VALID)])

    // Then the page names the household and the inviter
    expect(
      await screen.findByRole('heading', { name: 'Join the Lin home' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Mei Lin invited you.')).toBeInTheDocument()
    // And lists the household role and each location role
    expect(screen.getByText('Member')).toBeInTheDocument()
    expect(screen.getByText('Organizer')).toBeInTheDocument()
    expect(screen.getByText('Viewer')).toBeInTheDocument()
    // And shows location and household names as stored, never title-cased
    for (const name of ['my Kitchen', 'Garage']) {
      let node: HTMLElement | null = screen.getByText(name)
      while (node) {
        expect(node.className).not.toMatch(/\bcapitalize\b/)
        node = node.parentElement
      }
    }
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
  })

  it('user who is already in the household is told so, with no Join button', async () => {
    // Given an invite to a household the person is already in
    renderCloud([previewMock({ ...VALID, status: 'ALREADY_MEMBER' })])

    // Then the page says so and links to the pantry
    expect(
      await screen.findByText('You are already in this household.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pantry' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
  })

  it('user who opens a used or expired link sees that it is no longer valid', async () => {
    // Given an invalid invite. The server sends no names for INVALID; this
    // fixture sends them anyway, so the test proves the PAGE hides them
    renderCloud([previewMock({ ...VALID, status: 'INVALID' })])

    // Then only the "no longer valid" text shows
    expect(
      await screen.findByText(
        'This invite is no longer valid. Ask for a new one.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/the Lin home/)).toBeNull()
    expect(screen.queryByText(/Mei Lin/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
  })

  it('user can join, and the device switches to the new household', async () => {
    // Given a valid invite
    const user = userEvent.setup()
    renderCloud([
      previewMock(VALID),
      {
        request: { query: JoinHouseholdDocument, variables: { token: TOKEN } },
        result: {
          data: {
            joinHousehold: {
              __typename: 'Household',
              id: 'household-joined',
              name: 'the Lin home',
              role: 'member',
            },
          },
        },
      },
    ])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then the device moves to the joined household (decision T23)
    await waitFor(() =>
      expect(switchToHouseholdMock).toHaveBeenCalledWith('household-joined'),
    )
  })

  it('user whose link was used meanwhile is told it is no longer valid', async () => {
    // Given a valid preview, and a join the server refuses as INVITE_INVALID
    const user = userEvent.setup()
    renderCloud([previewMock(VALID), joinRefusal('INVITE_INVALID')])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then the page says the link is no longer valid, and nothing switches
    expect(
      await screen.findByText(
        'This invite is no longer valid. Ask for a new one.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('user who joined meanwhile in another tab is told they are already in', async () => {
    // Given a valid preview, and a join the server refuses as ALREADY_MEMBER
    const user = userEvent.setup()
    renderCloud([previewMock(VALID), joinRefusal('ALREADY_MEMBER')])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then the page says they are already in the household
    expect(
      await screen.findByText('You are already in this household.'),
    ).toBeInTheDocument()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('user sees an error toast when the join fails for another reason, and can try again', async () => {
    // Given a join that fails with a network error
    const errorToast = vi.spyOn(toast, 'error')
    const user = userEvent.setup()
    renderCloud([
      previewMock(VALID),
      {
        request: { query: JoinHouseholdDocument, variables: { token: TOKEN } },
        error: new Error('network down'),
      },
    ])

    // When they press Join
    await user.click(await screen.findByRole('button', { name: 'Join' }))

    // Then a toast says it failed, and the Join button stays
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith('Could not join. Try again.'),
    )
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })
})
