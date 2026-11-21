import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { HOUSEHOLD_CHANGED_NOTICE_KEY } from '@/apollo/householdGuard'
import i18n from '@/i18n'
import { HouseholdChangedNotice } from './HouseholdChangedNotice'

function store(household: string, oldHousehold: string | null) {
  sessionStorage.setItem(
    HOUSEHOLD_CHANGED_NOTICE_KEY,
    JSON.stringify({ household, oldHousehold }),
  )
}

afterEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await act(() => i18n.changeLanguage('en'))
})

describe('HouseholdChangedNotice (households H7 task L.3, owner decision O51-A)', () => {
  it('user sees the message once after the reload, and the key is removed', () => {
    // Given the recovery stored a message before the reload
    store('Chen flat', 'The Lin home')

    // When the page loads
    const first = render(<HouseholdChangedNotice />)

    // Then the message shows, and is gone from storage
    expect(screen.getByRole('status')).toHaveTextContent(
      'You are now in Chen flat. Your last change was not saved, because this page still showed The Lin home.',
    )
    expect(sessionStorage.getItem(HOUSEHOLD_CHANGED_NOTICE_KEY)).toBeNull()

    // And a later load shows nothing
    first.unmount()
    render(<HouseholdChangedNotice />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('user can close the message', async () => {
    store('Chen flat', 'The Lin home')
    render(<HouseholdChangedNotice />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it("shows nothing for a message in another tab's storage, and leaves it there", () => {
    // Given a value under the key in localStorage, which every tab shares
    localStorage.setItem(
      HOUSEHOLD_CHANGED_NOTICE_KEY,
      JSON.stringify({ household: 'Chen flat', oldHousehold: 'The Lin home' }),
    )

    // When this tab loads
    render(<HouseholdChangedNotice />)

    // Then it shows nothing and removes nothing: the message is for the tab
    // that recovered, and it lives in that tab's sessionStorage
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(localStorage.getItem(HOUSEHOLD_CHANGED_NOTICE_KEY)).not.toBeNull()
  })

  it('shows nothing when no message is stored', () => {
    const { container } = render(<HouseholdChangedNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('user sees the Chinese text, with "another household" when the old name is unknown', async () => {
    await act(() => i18n.changeLanguage('tw'))
    store('陳家', null)

    render(<HouseholdChangedNotice />)

    expect(screen.getByRole('status')).toHaveTextContent(
      '你目前在 陳家。這個頁面還停留在另一個家庭，所以剛才的變更沒有儲存。',
    )
  })

  it('keeps the name as stored, with no capitalize', () => {
    store('iHerb house', 'the Lin home')
    render(<HouseholdChangedNotice />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('You are now in iHerb house.')
    expect(status.closest('.capitalize')).toBeNull()
  })
})
