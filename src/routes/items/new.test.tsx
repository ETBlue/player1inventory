// src/routes/items/new.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { routeTree } from '@/routeTree.gen'

describe('New item page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderNewItemPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/items/new'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can toggle measurement switch even without measurement unit', async () => {
    const user = userEvent.setup()

    // Given the new item page with no fields filled
    renderNewItemPage()

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: /track in measurement/i }),
      ).toBeInTheDocument()
    })

    // When measurement unit is empty (default)
    const measurementUnitInput = screen.getByLabelText(
      /measurement unit/i,
    ) as HTMLInputElement
    expect(measurementUnitInput.value).toBe('')

    // Then the switch is enabled (not disabled)
    const trackSwitch = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    expect(trackSwitch).not.toBeDisabled()

    // And user can toggle it on
    await user.click(trackSwitch)
    expect(trackSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('save button is disabled and validation message shown when measurement mode requires missing fields', async () => {
    const user = userEvent.setup()

    // Given the new item page
    renderNewItemPage()

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: /track in measurement/i }),
      ).toBeInTheDocument()
    })

    // Fill in the required name
    await user.type(screen.getByLabelText(/name/i), 'Test Item')

    // When user enables measurement tracking without filling measurement fields
    const trackSwitch = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(trackSwitch)

    // Then save button is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })

    // And validation message shows both fields required
    expect(
      screen.getByText(/measurement unit and amount per package are required/i),
    ).toBeInTheDocument()

    // When user fills in measurement unit only
    await user.type(screen.getByLabelText(/measurement unit/i), 'g')

    // Then validation message changes to amount per package only
    await waitFor(() => {
      expect(
        screen.getByText(/amount per package is required/i),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()

    // When user fills in amount per package too
    await user.type(screen.getByLabelText(/amount per package/i), '500')

    // Then save button becomes enabled and no validation message
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
    })
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument()
  })
})
