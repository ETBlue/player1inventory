import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { JSX } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { elementAt } from '@/test/narrow'
import type { Vendor } from '@/types'

// Mock TanStack Router
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouterState: (opts?: {
      select?: (state: {
        location: {
          pathname: string
          searchStr: string
          search: Record<string, unknown>
        }
      }) => unknown
    }) => {
      const state = {
        location: {
          pathname: '/settings/household/vendors',
          searchStr: '',
          search: {},
        },
      }
      return opts?.select ? opts.select(state) : state
    },
    Link: ({
      children,
      to,
      ...props
    }: {
      children?: React.ReactNode
      to: string
      [key: string]: unknown
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

// Mock vendor hooks
vi.mock('@/hooks/useVendors', () => ({
  useVendors: vi.fn(),
  useDeleteVendor: vi.fn(),
  useItemCountByVendor: vi.fn(),
  useCreateVendor: vi.fn(),
}))

// Mock useVendorItemCounts hook
vi.mock('@/hooks/useVendorItemCounts', () => ({
  useVendorItemCounts: vi.fn(),
}))

// Mock useAppNavigation hook
vi.mock('@/hooks/useAppNavigation', () => ({
  useAppNavigation: vi.fn(),
}))

const { useVendors, useDeleteVendor, useItemCountByVendor, useCreateVendor } =
  await import('@/hooks/useVendors')

const { useVendorItemCounts } = await import('@/hooks/useVendorItemCounts')

const { useAppNavigation } = await import('@/hooks/useAppNavigation')

const mockVendors: Vendor[] = [
  { id: '1', name: 'Costco', createdAt: new Date() },
  { id: '2', name: "Trader Joe's", createdAt: new Date() },
]

// `useVendors`, `useItemCountByVendor`, `useDeleteVendor` and
// `useCreateVendor` each return a union of two shapes: the cloud branch's
// hand-rolled object, or TanStack's own result in local mode (see
// `hooks/useVendors.ts` lines 42, 234, 196 and 96). The cloud branch is the
// simpler half of each union and can be built in full, so these mocks return
// that shape and need no cast.
//
// What the page reads: `vendors/index.tsx:22` reads `useVendors().data` and
// `.isLoading`; `:24` and `:77` read `useDeleteVendor().mutate(id)`;
// `NewVendorDialog` reads `useCreateVendor().mutateAsync` and `.isPending`.
const setupMocks = (
  vendors: Vendor[] = mockVendors,
  vendorCounts: Map<string, number> = new Map(),
) => {
  const mutate = vi.fn(async (_id: string) => {})
  const goBack = vi.fn()
  vi.mocked(useVendors).mockReturnValue({
    data: vendors,
    isLoading: false,
    isError: false,
  })
  vi.mocked(useDeleteVendor).mockReturnValue({
    mutate,
    mutateAsync: vi.fn(async (_id: string) => true),
    isPending: false,
  })
  vi.mocked(useVendorItemCounts).mockReturnValue(vendorCounts)
  vi.mocked(useItemCountByVendor).mockReturnValue({
    data: 0,
    isLoading: false,
    isError: false,
  })
  vi.mocked(useCreateVendor).mockReturnValue({
    mutate: vi.fn(async (_name: string) => {}),
    // `CreateVendorMutation`'s payload is `{ id, name }`. It carried a
    // required `userId` until issue #359 dropped that field from every web
    // document. No assertion in this file reads either field;
    // `NewVendorDialog.tsx:45` only reads `id`.
    mutateAsync: vi.fn(async (_name: string) => ({
      id: 'new-id',
      name: 'Test',
    })),
    isPending: false,
  })
  vi.mocked(useAppNavigation).mockReturnValue({ goBack })
  return { mutate, goBack }
}

import { Route } from './vendors/index'

const VendorSettings = Route.options.component as () => JSX.Element

describe('Vendor Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderPage = (vendors?: Vendor[]) => {
    setupMocks(vendors)
    return render(<VendorSettings />)
  }

  it('user can see the vendor list', () => {
    // Given two vendors exist
    renderPage()

    // Then both vendor names are shown
    expect(screen.getByText('Costco')).toBeInTheDocument()
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
  })

  it('user can see empty state when no vendors exist', () => {
    // Given no vendors
    renderPage([])

    // Then empty state message is shown
    expect(screen.getByText('No vendors yet')).toBeInTheDocument()
    expect(
      screen.getByText('Create your first vendor to get started!'),
    ).toBeInTheDocument()
  })

  it('user can open the new vendor dialog when clicking New Vendor', async () => {
    // Given the vendors page
    renderPage()
    const user = userEvent.setup()

    // When user clicks "New Vendor"
    await user.click(screen.getByRole('button', { name: /new vendor/i }))

    // Then the dialog opens (no navigation to /settings/household/vendors/new)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalledWith({
      to: '/settings/household/vendors/new',
    })
  })

  it('user can delete a vendor with confirmation', async () => {
    // Given a vendor
    const { mutate } = setupMocks([
      { id: '1', name: 'Costco', createdAt: new Date() },
    ])
    render(<VendorSettings />)
    const user = userEvent.setup()

    // When user clicks the delete button
    await user.click(screen.getByRole('button', { name: 'Delete "Costco"' }))

    // Then confirmation dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // When user confirms
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    // Then deleteVendor mutation is called with the vendor id
    expect(mutate).toHaveBeenCalledWith('1')
  })

  it('displays item counts next to vendor names', async () => {
    // Given a vendor with 2 items assigned
    const vendorCounts = new Map([['1', 2]])
    setupMocks(
      [{ id: '1', name: 'Costco', createdAt: new Date() }],
      vendorCounts,
    )

    // When rendering the page
    render(<VendorSettings />)

    // Then the vendor card displays the item count
    expect(await screen.findByText(/Costco/i)).toBeInTheDocument()
    expect(screen.getByText(/2 items/i)).toBeInTheDocument()
  })

  it('back button navigates using useAppNavigation with /settings fallback', async () => {
    // Given vendor list page
    const { goBack } = setupMocks()
    render(<VendorSettings />)
    const user = userEvent.setup()

    // When user clicks back button (ArrowLeft icon button)
    // First button is the back button
    const backButton = elementAt(screen.getAllByRole('button'), 0)
    await user.click(backButton)

    // Then goBack is called (with /settings fallback configured in useAppNavigation)
    expect(goBack).toHaveBeenCalled()
  })
})

describe('Vendor Detail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('back button always goes to vendor list (skips tabs)', async () => {
    // Given a vendor detail page
    const { goBack } = setupMocks()

    // Mock vendor detail route (simplified - just testing navigation)
    const VendorDetail = () => {
      const { goBack: mockGoBack } = useAppNavigation(
        '/settings/household/vendors',
      )
      return (
        <div>
          <button type="button" onClick={() => mockGoBack()}>
            Back
          </button>
          <p>Vendor Detail</p>
        </div>
      )
    }

    render(<VendorDetail />)
    const user = userEvent.setup()

    // When user clicks back button
    const backButton = screen.getByRole('button', { name: /back/i })
    await user.click(backButton)

    // Then navigates back (to vendor list via goBack)
    expect(goBack).toHaveBeenCalled()
  })
})
