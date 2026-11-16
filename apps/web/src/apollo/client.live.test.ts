import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { createApolloClient, createApolloClientForE2E } from './client'
import { CLIENT_ID } from './clientId'
import { liveSocketOf } from './liveSocket'

// Captures what each Apollo client hands to graphql-ws's `createClient`, so
// the test can call the real `connectionParams` function. No socket opens.
const created = vi.hoisted(
  () => [] as { options: Record<string, unknown>; socket: object }[],
)
vi.mock('graphql-ws', () => ({
  createClient: (options: Record<string, unknown>) => {
    const socket = {
      on: () => () => {},
      subscribe: () => () => {},
      terminate: () => {},
      dispose: async () => {},
    }
    created.push({ options, socket })
    return socket
  },
}))

function lastParams() {
  const entry = created[created.length - 1]
  if (!entry) throw new Error('no graphql-ws client was created')
  return entry.options.connectionParams as () => Promise<Record<string, string>>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('en')
})

describe('the live-updates socket of each Apollo client', () => {
  it('production client sends the token, the tab id and the language', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await i18n.changeLanguage('tw')
    createApolloClient(async () => 'token-123')

    await expect(lastParams()()).resolves.toEqual({
      authorization: 'Bearer token-123',
      clientId: CLIENT_ID,
      language: 'tw',
    })
  })

  it('production client still sends the tab id with no token', async () => {
    // The server then closes with 4401 (no user), which is the right answer.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    createApolloClient(async () => null)

    const params = await lastParams()()
    expect(params.clientId).toBe(CLIENT_ID)
    expect(Object.keys(params)).not.toContain('authorization')
  })

  it('E2E client sends the E2E user id and the tab id', async () => {
    createApolloClientForE2E('e2e-user')

    await expect(lastParams()()).resolves.toEqual({
      e2eUserId: 'e2e-user',
      clientId: CLIENT_ID,
      language: 'en',
    })
  })

  it.each([
    ['production', () => createApolloClient(async () => null)],
    ['e2e', () => createApolloClientForE2E('e2e-user')],
  ])('%s client registers its socket for LiveUpdatesRunner', (_name, make) => {
    const client = make()
    const entry = created[created.length - 1]
    expect(liveSocketOf(client)).toBe(entry?.socket)
  })
})
