import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from '@/hooks/useActiveLocation'
import i18n from '@/i18n'
import { LocationSwitcher } from './LocationSwitcher'

// The location switcher in CLOUD mode: the View only badge (households H5
// task F.4).
//
// Three locations with three different roles, so a badge that read the wrong
// row, or showed for every role below organizer, is caught:
//   Kitchen  — viewer       (the badge)
//   Garage   — organizer    (no badge)
//   Pantry   — participant  (no badge: a participant can write)
// And a fourth, the Shed, where the caller has NO role. The server leaves it
// out of `locations` and lists it only in `householdLocations`. The switcher
// must not show it at all.
//
// The household role is a second, separate axis. The same location roles are
// tested with a household `member` and with a `manager`: a manager may edit
// the catalog and still be only a viewer of the Kitchen (Review Focus 4).

const KITCHEN = 'clw3loc0a0000s9f8h7g6d5e4'
const GARAGE = 'clw3loc0b0001s9f8h7g6d5e5'
const PANTRY = 'clw3loc0c0002s9f8h7g6d5e6'
const SHED = 'clw3loc0d0003s9f8h7g6d5e7'

type Role = 'organizer' | 'participant' | 'viewer' | null

function row(id: string, name: string, order: number, myRole: Role) {
  return {
    __typename: 'Location' as const,
    id,
    name,
    order,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    myRole,
  }
}

const WITH_ROLES = [
  row(KITCHEN, 'Cloud Kitchen', 0, 'viewer'),
  row(GARAGE, 'Cloud Garage', 1, 'organizer'),
  row(PANTRY, 'Cloud Pantry', 2, 'participant'),
]
const SHED_ROW = row(SHED, 'Cloud Shed', 3, null)

const mockHouseholdRole = vi.fn<() => string>()
const mockHouseholdLoading = vi.fn<() => boolean>()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    // The switcher's list: only the locations with a role.
    useGetLocationsQuery: () => ({
      data: { locations: WITH_ROLES },
      loading: false,
      error: undefined,
    }),
    // The settings list, with the Shed. A switcher that read it would show
    // the Shed.
    useGetHouseholdLocationsQuery: () => ({
      data: {
        householdLocations: [
          ...WITH_ROLES.map((l) => ({ ...l, hasOrganizer: true })),
          { ...SHED_ROW, hasOrganizer: true },
        ],
      },
      loading: false,
      error: undefined,
    }),
    useGetHouseholdQuery: () =>
      mockHouseholdLoading()
        ? { data: undefined, loading: true, error: undefined }
        : {
            data: {
              household: {
                __typename: 'Household',
                id: 'hh-1',
                name: 'Home',
                role: mockHouseholdRole(),
              },
            },
            loading: false,
            error: undefined,
          },
    useBootstrapCartsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
  }
})

function renderSwitcher(variant: 'compact' | 'full') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ActiveLocationProvider>
          <LocationSwitcher variant={variant} />
        </ActiveLocationProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

/** The trigger, once it names the active location. */
async function trigger(name: string) {
  return screen.findByRole('button', {
    name: new RegExp(`^Switch location \\(current: ${name}`),
  })
}

/** Open the menu and return its row for `name`. */
async function menuRow(name: string) {
  const items = await screen.findAllByRole('menuitem')
  const found = items.find((i) => within(i).queryByText(name) !== null)
  if (!found) throw new Error(`no menu row shows "${name}"`)
  return found
}

function activate(id: string) {
  localStorage.setItem(activeLocationStorageKey('cloud'), id)
}

describe('LocationSwitcher in cloud — View only (households H5 task F.4)', () => {
  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    mockHouseholdRole.mockReturnValue('member')
    mockHouseholdLoading.mockReturnValue(false)
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
    vi.clearAllMocks()
  })

  it('location viewer sees View only next to that location, on the trigger and in the menu', async () => {
    // Given a household member who is a viewer of the Kitchen, the active
    // location
    activate(KITCHEN)
    renderSwitcher('full')
    const user = userEvent.setup()

    // Then the trigger shows the badge, and says it to a screen reader
    const button = await trigger('Cloud Kitchen')
    expect(button).toHaveAccessibleName(
      'Switch location (current: Cloud Kitchen View only)',
    )
    // The badge is a <span>: a <div> inside a <button> is not valid HTML
    expect(within(button).getByText('View only').tagName).toBe('SPAN')

    // And in the menu only the Kitchen row has the badge, and its name
    // reads "Cloud Kitchen View only", not "Cloud KitchenView only"
    await user.click(button)
    expect(
      await screen.findByRole('menuitem', { name: 'Cloud Kitchen View only' }),
    ).toBeInTheDocument()
    expect(
      within(await menuRow('Cloud Kitchen')).getByText('View only').tagName,
    ).toBe('SPAN')
    for (const name of ['Cloud Garage', 'Cloud Pantry']) {
      expect(
        within(await menuRow(name)).queryByText('View only'),
      ).not.toBeInTheDocument()
    }
  })

  it('household manager who is only a viewer of the active location still sees View only', async () => {
    // Given a household MANAGER, who may edit the catalog, and is a viewer of
    // the Kitchen. The badge follows the location role only.
    mockHouseholdRole.mockReturnValue('manager')
    activate(KITCHEN)
    renderSwitcher('full')

    const button = await trigger('Cloud Kitchen')
    expect(within(button).getByText('View only')).toBeInTheDocument()
  })

  it('location organizer sees no View only badge on the trigger', async () => {
    // Given the active location is the Garage, which the caller organizes
    activate(GARAGE)
    renderSwitcher('full')
    const user = userEvent.setup()

    const button = await trigger('Cloud Garage')
    expect(button).toHaveAccessibleName(
      'Switch location (current: Cloud Garage)',
    )
    expect(within(button).queryByText('View only')).not.toBeInTheDocument()

    // And the menu still marks the Kitchen, which is not active
    await user.click(button)
    expect(
      within(await menuRow('Cloud Kitchen')).getByText('View only'),
    ).toBeInTheDocument()
  })

  it('user sees the trigger named with its visible words, in order, in both languages', () => {
    // WCAG 2.5.3 Label in Name: the full trigger shows "<name> View only",
    // so its accessible name must contain that text, in that order. A
    // person using voice control says what they see.
    const en = i18n.getFixedT('en')
    const tw = i18n.getFixedT('tw')
    expect(
      en('locationSwitcher.triggerLabelViewOnly', { name: 'Cloud Kitchen' }),
    ).toContain(`Cloud Kitchen ${en('locationSwitcher.viewOnly')}`)
    expect(
      tw('locationSwitcher.triggerLabelViewOnly', { name: 'Cloud Kitchen' }),
    ).toContain(`Cloud Kitchen ${tw('locationSwitcher.viewOnly')}`)
    // And the plain trigger shows only the name, which its label contains
    expect(
      en('locationSwitcher.triggerLabel', { name: 'Cloud Kitchen' }),
    ).toContain('Cloud Kitchen')
    expect(
      tw('locationSwitcher.triggerLabel', { name: 'Cloud Kitchen' }),
    ).toContain('Cloud Kitchen')
  })

  it('location participant sees no View only badge', async () => {
    activate(PANTRY)
    renderSwitcher('full')

    const button = await trigger('Cloud Pantry')
    expect(within(button).queryByText('View only')).not.toBeInTheDocument()
  })

  it('location viewer sees the eye mark on the compact trigger, and it is named', async () => {
    activate(KITCHEN)
    renderSwitcher('compact')

    const button = await trigger('Cloud Kitchen')
    expect(button).toHaveAccessibleName(
      'Switch location (current: Cloud Kitchen View only)',
    )
    expect(
      within(button).getByTestId('location-switcher-view-only'),
    ).toBeInTheDocument()
  })

  it('location organizer sees no eye mark on the compact trigger', async () => {
    activate(GARAGE)
    renderSwitcher('compact')

    const button = await trigger('Cloud Garage')
    expect(
      within(button).queryByTestId('location-switcher-view-only'),
    ).not.toBeInTheDocument()
  })

  it('user does not see a location they have no role on in the switcher', async () => {
    activate(GARAGE)
    renderSwitcher('full')
    const user = userEvent.setup()

    await user.click(await trigger('Cloud Garage'))
    // The three locations with a role are listed
    expect(await menuRow('Cloud Pantry')).toBeInTheDocument()
    // The Shed is not
    expect(
      screen.queryByRole('menuitem', { name: /Cloud Shed/ }),
    ).not.toBeInTheDocument()
  })

  it('user sees the View only badge while the household role is still loading', async () => {
    // The badge follows the LOCATION role only. Since the review of
    // households H5 task F.7 the location rights do not wait for
    // `GetHousehold`: they are known as soon as the location list is. (Until
    // then this test said the opposite: no badge while the household loads.)
    // While the location list itself loads, `roleAt` is `null` and no badge
    // shows; that is pinned in `usePermissions.test.tsx`.
    mockHouseholdLoading.mockReturnValue(true)
    activate(KITCHEN)
    renderSwitcher('full')

    const button = await trigger('Cloud Kitchen')
    expect(within(button).getByText('View only')).toBeInTheDocument()
  })
})
