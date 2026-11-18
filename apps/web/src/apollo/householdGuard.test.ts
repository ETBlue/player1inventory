import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetHousehold,
  LAST_HOUSEHOLD_ID_KEY,
  switchToHousehold,
} from './householdGuard'

const clearCacheMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('./persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./persistence')>()
  return { ...actual, clearCache: clearCacheMock }
})

const ACTIVE_KEY = 'active-location-id:cloud'
const reloadMock = vi.fn()
const replaceMock = vi.fn()
const originalLocation = window.location

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadMock, replace: replaceMock },
    writable: true,
    configurable: true,
  })
  localStorage.setItem(ACTIVE_KEY, 'location-of-old-household')
  localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-old')
})

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
  localStorage.clear()
  reloadMock.mockReset()
  replaceMock.mockReset()
  clearCacheMock.mockClear()
})

describe('switchToHousehold', () => {
  it('clears, stores the new id and reloads the same page', async () => {
    // When the household changes with no target page
    await switchToHousehold('h-new')

    // Then the old data is gone and the page reloads in place
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-new')
    expect(reloadMock).toHaveBeenCalledOnce()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('loads the target page instead of reloading, when one is given', async () => {
    // When the household changes with a target page (the join page passes
    // `/`: reloading `/join/<token>` would show the used invite as invalid)
    await switchToHousehold('h-new', { to: '/' })

    // Then the browser goes to the target, and does not reload in place
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-new')
    expect(replaceMock).toHaveBeenCalledWith('/')
    expect(reloadMock).not.toHaveBeenCalled()
  })
})

describe('forgetHousehold (households H5b, task G.8)', () => {
  it('clears the cache and both keys, and stays on the page', async () => {
    // When the person is in no household any more
    await forgetHousehold()

    // Then the old household's data is gone, no id is stored, and the page
    // does not change: the no-household screen is what they should see
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBeNull()
    expect(reloadMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
