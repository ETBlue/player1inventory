import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'

// No-op Apollo client — satisfies ApolloContext for skip:true hooks in the cooking route.
const noopApolloClient = new ApolloClient({
  link: new ApolloLink(() => null),
  cache: new InMemoryCache(),
})

const meta = {
  title: 'Recipe/CookingControlBar',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ControlBarStory({ initialUrl = '/cooking' }: { initialUrl?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
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

export const Default: Story = {
  render: () => <ControlBarStory />,
}

export const AllExpanded: Story = {
  render: () => <ControlBarStory initialUrl="/cooking" />,
}

export const SortByRecent: Story = {
  render: () => <ControlBarStory initialUrl="/cooking?sort=recent" />,
}

export const SortDescending: Story = {
  render: () => <ControlBarStory initialUrl="/cooking?sort=name&dir=desc" />,
}

export const WithSearch: Story = {
  render: () => <ControlBarStory initialUrl="/cooking?q=pasta" />,
}
