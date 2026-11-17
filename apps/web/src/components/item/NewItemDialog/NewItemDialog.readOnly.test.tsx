import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import {
  asHouseholdManager,
  asHouseholdMember,
  resetRole,
} from '@/test/rolePermissions'
import { NewItemDialog } from './NewItemDialog'

// Households H5 task F.5: the pantry Add dialog. Stocking an EXISTING item
// here is a location right (the person is a participant of the active
// location), so a household member keeps it. Creating a NEW item is a
// catalog write, so a member gets no "Create" option, no Create button and
// no package unit field. The plan named only the search "Create item"; this
// dialog is the other way to create an item from the pantry.
vi.mock('@/hooks/usePermissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/usePermissions')>()
  const { roleOverride } = await import('@/test/rolePermissions')
  return {
    ...real,
    usePermissions: () => {
      // The real hook always runs, so the hook order never changes
      const live = real.usePermissions()
      const role = roleOverride()
      return role ? real.permissionsFor(role) : live
    },
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...original, useNavigate: () => vi.fn() }
})

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>
        <NewItemDialog open={true} onOpenChange={vi.fn()} />
      </ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await db.items.clear()
  await db.itemStocks.clear()
})

afterEach(() => {
  resetRole()
})

const people = [
  { who: 'household member', as: asHouseholdMember, canEdit: false },
  { who: 'household manager', as: asHouseholdManager, canEdit: true },
] as const

describe.each(people)('$who in the pantry Add dialog', (person) => {
  it(`${person.who} ${person.canEdit ? 'can' : 'cannot'} create a new item, and can still pick an existing one`, async () => {
    // Given Bread exists in the catalog, stocked only at another location,
    // so the dialog offers it as "not yet stocked here"
    await createItem({ name: 'Bread', tagIds: [] }, 'another-location')
    person.as()
    renderDialog()
    const user = userEvent.setup()
    const box = await screen.findByRole('combobox', { name: /name/i })

    // An existing item is offered to both (stocking it is a location right)
    await user.type(box, 'Brea')
    expect(
      await screen.findByRole('option', { name: /Bread/ }),
    ).toBeInTheDocument()

    // A new name: only a manager gets the Create option
    await user.clear(box)
    await user.type(box, 'Butter')
    const create = screen.queryByRole('option', { name: 'Create "Butter"' })
    if (person.canEdit) {
      expect(create).toBeInTheDocument()
    } else {
      expect(create).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'Create "Butter"' }),
      ).toBeNull()
      // And Enter creates nothing
      await user.keyboard('{Enter}')
      await new Promise((resolve) => setTimeout(resolve, 50))
      const names = (await db.items.toArray()).map((i) => i.name)
      expect(names).not.toContain('Butter')
    }
  })
})
