import './i18n'
import { ClerkProvider } from '@clerk/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { db } from './db'
import { migrateItemsToV2 } from './db/migrate'
import { routeTree } from './routeTree.gen'
import './index.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!publishableKey) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set')

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
if (!rootElement) {
  throw new Error('Root element not found')
}

// Run database migration on app start
db.open()
  .then(() => migrateItemsToV2())
  .then(() => {
    console.log('Database migration complete')
    createRoot(rootElement).render(
      <StrictMode>
        <ClerkProvider publishableKey={publishableKey}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            {/* <ReactQueryDevtools initialIsOpen={false} /> */}
          </QueryClientProvider>
        </ClerkProvider>
      </StrictMode>,
    )
  })
  .catch((error) => {
    console.error('Database migration failed:', error)
    // Still render the app even if migration fails
    createRoot(rootElement).render(
      <StrictMode>
        <ClerkProvider publishableKey={publishableKey}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            {/* <ReactQueryDevtools initialIsOpen={false} /> */}
          </QueryClientProvider>
        </ClerkProvider>
      </StrictMode>,
    )
  })
