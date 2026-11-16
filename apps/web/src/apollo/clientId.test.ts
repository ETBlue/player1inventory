import { describe, expect, it, vi } from 'vitest'
import { CLIENT_ID, makeClientId } from './clientId'

// The server accepts a tab id of 1 to 64 characters (`clientIdFrom` in
// `apps/server/src/context.ts`) and refuses the socket without one.
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('makeClientId', () => {
  it('uses crypto.randomUUID when it exists', () => {
    const randomUUID = vi.fn(
      () => '11111111-2222-4333-8444-555555555555' as const,
    )
    const id = makeClientId({ randomUUID, getRandomValues: vi.fn() })
    expect(id).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('falls back to getRandomValues outside a secure context', () => {
    // http://192.168.x.x (the dev server opened from a phone) has no
    // `crypto.randomUUID`.
    const id = makeClientId({
      getRandomValues: (array) => crypto.getRandomValues(array),
    })
    expect(id).toMatch(UUID_SHAPE)
    expect(id.length).toBeLessThanOrEqual(64)
  })

  it('gives a different id each call', () => {
    expect(makeClientId()).not.toBe(makeClientId())
  })
})

describe('CLIENT_ID', () => {
  it('is one id the server accepts, fixed for the page load', async () => {
    expect(CLIENT_ID.length).toBeGreaterThan(0)
    expect(CLIENT_ID.length).toBeLessThanOrEqual(64)
    const again = await import('./clientId')
    expect(again.CLIENT_ID).toBe(CLIENT_ID)
  })
})
