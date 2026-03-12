import './i18n'
import './index.css'
import { ApolloClient, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { ClerkProvider } from '@clerk/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApolloWrapper } from './apollo/ApolloWrapper'
import { db } from './db'
import { migrateItemsToV2 } from './db/migrate'
import type { DataMode } from './lib/dataMode'
import { DATA_MODE_STORAGE_KEY, DEFAULT_DATA_MODE } from './lib/dataMode'
import { routeTree } from './routeTree.gen'

// Read mode before React mounts — determines provider tree for this page lifetime
const mode = (localStorage.getItem(DATA_MODE_STORAGE_KEY) ??
  DEFAULT_DATA_MODE) as DataMode

// Minimal Apollo client for local mode — satisfies useGetItemsQuery context requirement
// without making any network requests (all Apollo hooks are skipped in local mode)
const localModeApolloClient = new ApolloClient({ cache: new InMemoryCache() })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

const root = createRoot(rootElement)

function renderApp() {
  if (mode === 'cloud') {
    const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
    if (!publishableKey)
      throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set')

    root.render(
      <StrictMode>
        <ClerkProvider publishableKey={publishableKey}>
          <ApolloWrapper>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </ApolloWrapper>
        </ClerkProvider>
      </StrictMode>,
    )
  } else {
    root.render(
      <StrictMode>
        <ApolloProvider client={localModeApolloClient}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ApolloProvider>
      </StrictMode>,
    )
  }
}

if (mode === 'local') {
  // Only run IndexedDB migration in local mode
  db.open()
    .then(() => migrateItemsToV2())
    .then(() => {
      console.log('Database migration complete')
      renderApp()
    })
    .catch((error) => {
      console.error('Database migration failed:', error)
      renderApp()
    })
} else {
  renderApp()
}
