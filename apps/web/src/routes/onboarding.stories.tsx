import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Onboarding',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function OnboardingStory({
  initialUrl = '/onboarding',
}: {
  initialUrl?: string
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    context: { queryClient },
  })

  return (
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>
  )
}

// Story 1: Welcome step — initial state of the onboarding flow
function WelcomeStory() {
  return <OnboardingStory initialUrl="/onboarding" />
}

export const Welcome: Story = {
  render: () => <WelcomeStory />,
}

// Story 2: Template overview step — 0 selected items/vendors
function TemplateOverviewStory() {
  return <OnboardingStory initialUrl="/onboarding" />
}

export const TemplateOverview: Story = {
  render: () => <TemplateOverviewStory />,
}
