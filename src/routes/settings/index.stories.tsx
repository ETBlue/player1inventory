import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { db } from '@/db'
import { LANGUAGE_STORAGE_KEY } from '@/lib/language'
import { routeTree } from '@/routeTree.gen'

const meta = {
  title: 'Routes/Settings',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SettingsStory({ setup }: { setup?: () => void }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      setup?.()
      setReady(true)
    }
    init()
  }, [setup])

  useEffect(() => {
    return () => {
      localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    }
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
    context: { queryClient },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

// Story 1: Default — no localStorage preferences (auto language detection, system theme)
function DefaultStory() {
  return (
    <SettingsStory
      setup={() => {
        localStorage.removeItem(LANGUAGE_STORAGE_KEY)
        localStorage.removeItem('theme-preference')
      }}
    />
  )
}

export const Default: Story = {
  render: () => <DefaultStory />,
}

// Story 2: Traditional Chinese selected explicitly
function TraditionalChineseStory() {
  return (
    <SettingsStory
      setup={() => {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw')
        localStorage.removeItem('theme-preference')
      }}
    />
  )
}

export const TraditionalChinese: Story = {
  render: () => <TraditionalChineseStory />,
}

// Story 3: English selected explicitly
function ExplicitEnglishStory() {
  return (
    <SettingsStory
      setup={() => {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
        localStorage.removeItem('theme-preference')
      }}
    />
  )
}

export const ExplicitEnglish: Story = {
  render: () => <ExplicitEnglishStory />,
}
