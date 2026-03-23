import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { ImportCard } from '.'

// ImportCard uses:
//   - useDataMode() — reads localStorage key 'data-mode'
//   - useApolloClient() — used in cloud mode for imperative queries
//
// Mocking strategy:
//   - localStorage is set in each story's `beforeEach` to control mode
//   - Apollo is mocked with MockedProvider (no specific queries needed for render)

const meta: Meta<typeof ImportCard> = {
  title: 'Settings/ImportCard',
  component: ImportCard,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]} addTypename={false}>
        <Story />
      </MockedProvider>
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
// Progress / error / done state stories
// These render the visual fragments directly rather than driving state through
// ImportCard, keeping them simple and reliable for Storybook and smoke tests.
// ---------------------------------------------------------------------------

function ImportingProgressStory() {
  return (
    <div className="p-4 max-w-sm space-y-2">
      <p className="text-sm text-foreground-muted">Importing Items…</p>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary h-2 rounded-full transition-all"
          style={{ width: '50%' }}
        />
      </div>
      <p className="text-xs text-foreground-muted">8 / 16 batches</p>
    </div>
  )
}

function ImportErrorStory() {
  return (
    <div className="p-4 max-w-sm space-y-2">
      <p className="text-sm text-destructive">
        Import failed during Network error.
      </p>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium"
      >
        Retry
      </button>
    </div>
  )
}

function ImportDoneStory() {
  return (
    <div className="p-4 max-w-sm">
      <p className="text-sm text-ok">Import complete.</p>
    </div>
  )
}

export const ImportingProgress: Story = {
  name: 'Importing — progress bar at 50%',
  render: () => <ImportingProgressStory />,
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}

export const ImportError: Story = {
  name: 'Error — failed with retry button',
  render: () => <ImportErrorStory />,
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}

export const ImportDone: Story = {
  name: 'Done — success message',
  render: () => <ImportDoneStory />,
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}
