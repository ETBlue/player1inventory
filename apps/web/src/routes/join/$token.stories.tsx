import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import {
  InvitePreviewDocument,
  type InvitePreviewQuery,
} from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { CloudRolePage, cloudRoleStorySetup } from '@/test/cloudRoleStory'

// The REAL join page (households H5b, task G.7), mounted through the router.
// Fixtures stay module-local: CSF turns every named export into a story.

const meta = {
  title: 'Pages/Join',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const TOKEN = 'storyTokenAbCdEfGhIjKlMnOpQrStUvWxYz0123456'
const JOIN_PATH = `/join/${TOKEN}`

const VALID: InvitePreviewQuery['invitePreview'] = {
  __typename: 'InvitePreview',
  status: 'VALID',
  householdName: 'the Lin home',
  invitedByName: 'Mei Lin',
  householdRole: 'member',
  locationRoles: [
    {
      __typename: 'InviteLocationRole',
      locationId: 'story-loc-kitchen',
      locationName: 'my Kitchen',
      role: 'organizer',
    },
    {
      __typename: 'InviteLocationRole',
      locationId: 'story-loc-garage',
      locationName: 'Garage',
      role: 'viewer',
    },
  ],
}

const NO_NAMES = {
  householdName: null,
  invitedByName: null,
  householdRole: null,
  locationRoles: null,
}

function previewMocks(preview: InvitePreviewQuery['invitePreview']) {
  return [
    {
      request: { query: InvitePreviewDocument, variables: { token: TOKEN } },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: { data: { invitePreview: preview } },
    },
  ]
}

export const Valid: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={JOIN_PATH}
      householdRole="owner"
      mocks={previewMocks(VALID)}
    />
  ),
}

/** A valid invite with a household role and no location roles: no locations title, no list. */
export const NoLocations: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={JOIN_PATH}
      householdRole="owner"
      mocks={previewMocks({ ...VALID, locationRoles: [] })}
    />
  ),
}

export const AlreadyMember: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={JOIN_PATH}
      householdRole="owner"
      mocks={previewMocks({ ...VALID, status: 'ALREADY_MEMBER' })}
    />
  ),
}

export const Invalid: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={JOIN_PATH}
      householdRole="owner"
      mocks={previewMocks({ ...VALID, ...NO_NAMES, status: 'INVALID' })}
    />
  ),
}

/** A visitor in local mode, the default for a new visitor (owner decision O12-A). */
function LocalModeStory() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [router] = useState(() =>
    createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [JOIN_PATH] }),
      context: { queryClient },
    }),
  )
  return (
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>
  )
}

export const LocalMode: Story = {
  beforeEach: () => {
    const previous = localStorage.getItem('data-mode')
    localStorage.setItem('data-mode', 'local')
    return () => {
      if (previous === null) localStorage.removeItem('data-mode')
      else localStorage.setItem('data-mode', previous)
    }
  },
  render: () => <LocalModeStory />,
}
