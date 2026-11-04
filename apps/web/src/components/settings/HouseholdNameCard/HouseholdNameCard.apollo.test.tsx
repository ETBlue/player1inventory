import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HouseholdLabel } from '@/components/settings/HouseholdLabel'
import {
  GetHouseholdDocument,
  RenameHouseholdDocument,
} from '@/generated/graphql'
import { HouseholdNameCard } from '.'

// The household name card with REAL Apollo hooks and a real cache (households
// H3a, task 3.13). `HouseholdNameCard.test.tsx` stubs the generated hooks, so
// it cannot see what happens after a save: the answer updates the cached
// `Household`, every reader shows the new name, and the form starts again
// from it (`key={data.name}`). This file pins those three things.
//
// `setup.ts` stubs `@/generated/graphql` for the whole suite. This file's own
// factory replaces that stub with the real module, so the real hooks run
// against `MockedProvider`.
//
// The `<Suspense>` inside `MockedProvider` is needed. Without it the tree
// renders as an empty `<div />`, with no error, and every query below fails
// to find its element. Measured 2026-11-04: even a plain sibling element
// placed BEFORE the card is not rendered then, and a `QueryClientProvider`
// around the tree does not help. With the boundary, nothing suspends (a
// fallback is never shown) and the whole tree renders. The cause was not
// found.
vi.mock('@/generated/graphql', async (importOriginal) => importOriginal())

const HOUSEHOLD = {
  __typename: 'Household' as const,
  id: 'household-1',
  role: 'owner' as const,
}

function mocks(): NonNullable<MockedProviderProps['mocks']> {
  return [
    {
      request: { query: GetHouseholdDocument },
      result: { data: { household: { ...HOUSEHOLD, name: 'Our Home' } } },
    },
    {
      request: {
        query: RenameHouseholdDocument,
        variables: { name: 'The Lab' },
      },
      result: {
        data: { renameHousehold: { ...HOUSEHOLD, name: 'The Lab' } },
      },
    },
  ]
}

function renderBoth() {
  return render(
    <MockedProvider mocks={mocks()} mockLinkDefaultOptions={{ delay: 0 }}>
      <Suspense fallback={null}>
        <p data-testid="label">
          <HouseholdLabel />
        </p>
        <HouseholdNameCard />
      </Suspense>
    </MockedProvider>,
  )
}

beforeEach(() => localStorage.setItem('data-mode', 'cloud'))
afterEach(() => localStorage.removeItem('data-mode'))

describe('HouseholdNameCard with the Apollo cache', () => {
  it('user sees the new name everywhere after a rename, and the form starts again from it', async () => {
    const user = userEvent.setup()
    renderBoth()

    // Given the stored name has loaded
    const field = await screen.findByRole('textbox', {
      name: 'Household name',
    })
    expect(field).toHaveValue('Our Home')
    expect(screen.getByTestId('label')).toHaveTextContent('Our Home')

    // When the owner saves a name with spaces around it
    await user.clear(field)
    await user.type(field, '  The Lab  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // Then the label, which reads the same cached household, shows it
    await waitFor(() =>
      expect(screen.getByTestId('label')).toHaveTextContent('The Lab'),
    )
    // And the form starts again from the stored, trimmed name
    expect(screen.getByRole('textbox', { name: 'Household name' })).toHaveValue(
      'The Lab',
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
