import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import { setupOfflineStory } from '@/test/offlineStoryHelpers'
import * as stories from './cooking.stories'

// The real generated hooks and Apollo React hooks, so the `MockedProvider`
// of `MemberReadOnly` takes effect. `setup.ts` stubs both for every other
// test. The local stories read Dexie, and their Apollo hooks skip.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// cooking.stories uses Dexie (fake-indexeddb/auto handles this in test setup)
// and ApolloProvider (no-op client, set up in the story itself).
// Each story initialises IndexedDB in a useEffect. Once loaded, the cooking
// page always renders a "Done" button (initially disabled).
const {
  Default,
  WithRecipes,
  Offline,
  WithCheckedRecipe,
  WithExpandedRecipe,
  NonConsumableIgnored,
  WithActiveToolbar,
  WithSearch,
  SortByRecent,
  SortByCount,
  StockStatusHealthy,
  StockStatusPartial,
  StockStatusUnavailable,
  NotStockedHereSplit,
  MemberReadOnly,
} = composeStories(stories)

describe('Cooking stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('Default empty state shows create recipe button', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /create recipe/i }),
    ).toBeInTheDocument()
  })

  it('WithRecipes renders without error', async () => {
    render(<WithRecipes />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  describe('Offline', () => {
    // Storybook runs this story's own `beforeEach` field when opened for
    // real; `composeStories` + `render()` here does not, so setup/cleanup is
    // repeated directly — see index.stories.test.tsx for the same pattern.
    let cleanup: () => void

    beforeEach(() => {
      cleanup = setupOfflineStory()
    })

    afterEach(() => {
      cleanup()
    })

    it('shows the OfflineBanner with the seeded sync time', async () => {
      render(<Offline />)
      const banner = await screen.findByRole('status')
      expect(banner).toHaveTextContent(/offline/i)
      // `waitFor`, not a bare `expect`: the banner exists before its sync
      // time is read (`getLastSyncedAt` in a `useEffect`), so a synchronous
      // check races that read and loses under load. Same fix and reason as
      // routes/index.stories.test.tsx (63f3b919).
      await waitFor(() => expect(banner).toHaveTextContent(/hours ago/i))
    })

    it('does not open PostLoginMigrationDialog on top of the page', async () => {
      render(<Offline />)
      await screen.findByRole('status')
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('WithSearch renders without error', async () => {
    render(<WithSearch />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('SortByRecent renders without error', async () => {
    render(<SortByRecent />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('WithCheckedRecipe renders without error', async () => {
    render(<WithCheckedRecipe />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('WithExpandedRecipe renders without error', async () => {
    render(<WithExpandedRecipe />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('NonConsumableIgnored counts only the consumable item', async () => {
    render(<NonConsumableIgnored />)
    expect(await screen.findByText('1 / 1 here')).toBeInTheDocument()
  })

  it('WithActiveToolbar renders without error', async () => {
    render(<WithActiveToolbar />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('SortByCount renders without error', async () => {
    render(<SortByCount />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('StockStatusHealthy shows every item stocked here and no health counts', async () => {
    render(<StockStatusHealthy />)
    expect(await screen.findByText('2 / 2 here')).toBeInTheDocument()
    expect(screen.queryByText(/empty/)).not.toBeInTheDocument()
    expect(screen.queryByText(/low stock/)).not.toBeInTheDocument()
  })

  it('StockStatusPartial shows the availability split with health counts', async () => {
    render(<StockStatusPartial />)
    expect(await screen.findByText('3 / 5 here')).toBeInTheDocument()
    expect(screen.getByText('1 empty')).toBeInTheDocument()
    expect(screen.getByText('1 low stock')).toBeInTheDocument()
  })

  it('NotStockedHereSplit sinks the unstocked recipe below the divider', async () => {
    render(<NotStockedHereSplit />)
    // Re-query inside waitFor: a recipe card is remounted when it moves
    // between the two sections as the item query resolves.
    await waitFor(() =>
      expect(screen.getByText(/not stocked here/i)).toHaveTextContent(
        '1 not stocked here',
      ),
    )
    expect(screen.getByLabelText('Beef Stew')).toBeInTheDocument()
    expect(screen.getByLabelText('Thai Curry')).toBeDisabled()
  })

  it('StockStatusUnavailable shows a disabled recipe with nothing stocked here', async () => {
    render(<StockStatusUnavailable />)
    await waitFor(() =>
      expect(screen.getByText('0 / 2 here')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Thai Curry')).toBeDisabled()
  })

  it('MemberReadOnly shows the read-only empty state and no Create recipe', async () => {
    // composeStories does not run a story's `beforeEach`, so it runs here
    onTestFinished(cloudRoleStorySetup())
    render(<MemberReadOnly />)
    // The note first: it shows only once the role has loaded as `member`.
    // While the role loads, Create recipe is hidden for every role.
    expect(
      await screen.findByText(
        'Only a household owner or manager can add or change these.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create recipe' })).toBeNull()
  })
})
