import type { Preview } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import '../src/index.css'

// Create a minimal router for Storybook that renders children
const rootRoute = createRootRoute({
  component: ({ children }) => <>{children}</>,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
})

const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$id',
  component: () => null,
})

const routeTree = rootRoute.addChildren([indexRoute, itemRoute])

const createStoryRouter = () =>
  createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
    (Story) => {
      const router = createStoryRouter()
      return (
        <RouterProvider router={router}>
          <Story />
        </RouterProvider>
      )
    },
  ],
}

export default preview
