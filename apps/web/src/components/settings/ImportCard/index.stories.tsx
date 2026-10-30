import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ImportCard } from '.'

// ImportCard uses:
//   - useDataMode() — reads localStorage key 'data-mode'
//   - useApolloClient() — used in cloud mode for imperative queries
//   - useQueryClient() — used in local mode to invalidate caches after import
//
// Mocking strategy:
//   - localStorage is set in each story's `beforeEach` to control mode
//   - Apollo is mocked with MockedProvider (no specific queries needed for render)
//   - QueryClientProvider wraps all stories to satisfy useQueryClient()

const queryClient = new QueryClient()

const meta: Meta<typeof ImportCard> = {
  title: 'Components/Settings/ImportCard',
  component: ImportCard,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MockedProvider mocks={[]}>
          <Story />
        </MockedProvider>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ImportCard>

export const Default: Story = {
  name: 'Default — idle state',
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}

export const Loading: Story = {
  name: 'Loading — importing state',
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
  // Note: the loading state is achieved via file input interaction;
  // this story documents the intended appearance when isImporting=true.
  // The button shows "Importing..." and is disabled during file processing.
}

// ---------------------------------------------------------------------------
// There are deliberately NO stories for the cloud import's progress, error and
// done phases.
//
// Three such stories lived here until 2026-10-13. Each was a hand-written
// static `<div>` that never mounted `ImportCard`, so each showed markup the
// component cannot produce — and had drifted: they used `text-sm` where the
// component uses `text-xs`, and a progress track class `bg-muted` that is not
// a token in this repo at all (the only `bg-muted` in `apps/web/src`), so that
// track rendered with no background. Their smoke tests asserted text inside
// those fixtures, which means deleting the real error branch from
// `ImportCard.tsx` left them green: false coverage.
//
// Those three phases are state inside `ImportCard`, reachable only by driving
// `importCloudData` to reject or resolve. A story cannot `vi.mock`, so putting
// the real component into those phases needs Storybook module mocking
// (`sb.mock` in `.storybook/preview.tsx`, which is repo-wide) plus a `play`
// function that uploads a file. That was judged too much machinery for one
// visual reference.
//
// The error phase and its Retry button are covered instead by
// `index.test.tsx` — "user retrying a failed cloud import resumes the session
// the failure carried", which mocks `importCloudData` with `vi.mock`.
// ---------------------------------------------------------------------------
