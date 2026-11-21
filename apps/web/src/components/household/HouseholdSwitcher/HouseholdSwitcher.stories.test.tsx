import { composeStories } from '@storybook/react'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stories from './HouseholdSwitcher.stories'

// `.run()`, not `render(<Story />)`: only `.run()` calls the meta's
// `beforeEach`, which sets cloud mode (in local mode the switcher renders
// nothing), and the story's `play`, which opens the menu.
//
// The stories answer through `MockedProvider`, so the real generated hooks
// and Apollo React hooks must run. `src/test/setup.ts` stubs both; this file
// puts the real modules back.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const {
  OneHousehold,
  TwoHouseholds,
  LongName,
  Loading,
  LoadError,
  Switching,
  CreateDialogOpen,
  Card,
} = composeStories(stories)

afterEach(() => localStorage.removeItem('data-mode'))

async function menu() {
  return screen.findByRole('menu', { name: /Switch to…/ })
}

describe('HouseholdSwitcher stories smoke tests', () => {
  it('OneHousehold lists that household and Create new', async () => {
    await OneHousehold.run()
    const list = await menu()
    expect(within(list).getAllByRole('menuitemradio')).toHaveLength(1)
    expect(
      within(list).getByRole('menuitem', { name: 'Create new' }),
    ).toBeInTheDocument()
  })

  it('TwoHouseholds checks the current one', async () => {
    await TwoHouseholds.run()
    const list = await menu()
    expect(
      within(list).getByRole('menuitemradio', { name: /the Lin home/ }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      within(list).getByRole('menuitemradio', { name: /Chen flat/ }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('LongName shows the whole long name', async () => {
    await LongName.run()
    const list = await menu()
    expect(
      within(list).getByText(
        'The Lin family household on Roosevelt Road, second floor, back door',
      ),
    ).toBeInTheDocument()
  })

  it('Loading shows the loading row', async () => {
    await Loading.run()
    const list = await menu()
    expect(within(list).getByText('Loading households…')).toBeInTheDocument()
  })

  it('LoadError shows the error row', async () => {
    await LoadError.run()
    const list = await menu()
    expect(
      within(list).getByText('Could not load your households.'),
    ).toBeInTheDocument()
  })

  it('Switching keeps the menu open with every row off', async () => {
    await Switching.run()
    const list = await menu()
    await waitFor(() => {
      for (const row of within(list).getAllByRole('menuitemradio')) {
        expect(row).toHaveAttribute('aria-disabled', 'true')
      }
    })
  })

  it('CreateDialogOpen shows the create dialog', async () => {
    await CreateDialogOpen.run()
    const dialog = await screen.findByRole('dialog', {
      name: 'Create a new household',
    })
    expect(within(dialog).getByLabelText('Household name')).toBeInTheDocument()
  })

  it('Card shows the accordion button', async () => {
    await Card.run()
    expect(
      await screen.findByRole('button', {
        name: 'Switch to… Move to another household, or create one',
      }),
    ).toBeInTheDocument()
  })
})
