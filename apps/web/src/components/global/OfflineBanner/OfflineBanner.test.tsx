import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLastSyncedAt } from '@/apollo/persistence'
import i18n from '@/i18n'
import { OfflineBanner } from './OfflineBanner'

// The stories always pass both props, so they never reach these two code
// paths. These tests render the banner the way the app does — with no props at
// all — so `useIsOffline()` and `getLastSyncedAt()` are actually exercised.
vi.mock('@/apollo/persistence', () => ({
  getLastSyncedAt: vi.fn(),
}))

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

const HOURS_AGO_2 = () => new Date(Date.now() - 2 * 60 * 60 * 1000)
const MINUTES_AGO_10 = () => new Date(Date.now() - 10 * 60 * 1000)

beforeEach(() => {
  setOnLine(true)
  vi.mocked(getLastSyncedAt).mockResolvedValue(null)
})

afterEach(async () => {
  setOnLine(true)
  await act(async () => {
    await i18n.changeLanguage('en')
  })
  vi.clearAllMocks()
})

describe('OfflineBanner in the app', () => {
  it('user sees the stored sync time when the app renders it with no props', async () => {
    // Given the device has no connection and a sync time was stored 2 hours ago
    setOnLine(false)
    vi.mocked(getLastSyncedAt).mockResolvedValue(HOURS_AGO_2())

    // When the banner renders the way __root.tsx renders it — no props
    await act(async () => {
      render(<OfflineBanner />)
    })

    // Then the banner appears and reports the stored time
    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent(/offline/i)
    await waitFor(() => expect(banner).toHaveTextContent(/2 hours ago/i))
  })

  it('user sees the time as of when the connection dropped, not as of app start', async () => {
    // Given the app started online, when the stored time was 2 hours old
    vi.mocked(getLastSyncedAt).mockResolvedValue(HOURS_AGO_2())
    await act(async () => {
      render(<OfflineBanner />)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // When the app keeps syncing and only then loses the connection
    vi.mocked(getLastSyncedAt).mockResolvedValue(MINUTES_AGO_10())
    setOnLine(false)
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })

    // Then the banner reports the newer time, not the one read at app start
    const banner = await screen.findByRole('status')
    await waitFor(() => expect(banner).toHaveTextContent(/10 minutes ago/i))
    expect(banner).not.toHaveTextContent(/2 hours ago/i)
  })

  it('user reading in Traditional Chinese sees a Chinese time, not an English one', async () => {
    // Given the app language is Traditional Chinese
    await act(async () => {
      await i18n.changeLanguage('tw')
    })
    setOnLine(false)
    vi.mocked(getLastSyncedAt).mockResolvedValue(HOURS_AGO_2())

    // When the banner renders
    await act(async () => {
      render(<OfflineBanner />)
    })

    // Then the time is written in Chinese. `i18n.language` is 'tw', which is
    // the subtag for Twi, so passing it to Intl gives English.
    const banner = await screen.findByRole('status')
    await waitFor(() => expect(banner).toHaveTextContent(/2 小時前/))
    expect(banner).not.toHaveTextContent(/hours ago/i)
  })
})
