import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLOSE_MAX_AGE,
  CLOSE_UNAUTHORIZED,
  type Ctx,
  createWsHandlers,
  SOCKET_MAX_AGE_MS,
  type WsServerDeps,
} from './wsServer.js'

// The WebSocket sign-in and the 60-minute limit (households H3c-1, task C.3).
// These tests call the handlers with a fake socket and fake timers, with no
// network. `wsServer.socket.test.ts` opens a real socket.

const TOKEN = 'secret-session-token-value'

function deps(over: Partial<WsServerDeps> = {}) {
  return {
    e2eTestMode: false,
    verifyClerkToken: vi.fn(async (token: string) => (token === TOKEN ? 'clerk-user' : null)),
    ensureUser: vi.fn(async () => {}),
    ...over,
  }
}

function fakeCtx(connectionParams: Record<string, unknown> | undefined) {
  const close = vi.fn()
  const ctx = { connectionParams, extra: { socket: { close } } } as unknown as Ctx
  return { ctx, close }
}

const GOOD = { authorization: `Bearer ${TOKEN}`, clientId: 'tab-1' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('onConnect — refused sockets close with 4401', () => {
  it('no token', async () => {
    const d = deps()
    const { ctx, close } = fakeCtx({ clientId: 'tab-1' })

    expect(await createWsHandlers(d).onConnect(ctx)).toBe(false)
    expect(close).toHaveBeenCalledWith(4401, 'Unauthorized')
    expect(d.ensureUser).not.toHaveBeenCalled()
  })

  it('no connectionParams at all', async () => {
    const { ctx, close } = fakeCtx(undefined)

    expect(await createWsHandlers(deps()).onConnect(ctx)).toBe(false)
    expect(close).toHaveBeenCalledWith(4401, 'Unauthorized')
  })

  it('a token the check refuses (null)', async () => {
    const d = deps()
    const { ctx, close } = fakeCtx({ authorization: 'Bearer wrong', clientId: 'tab-1' })

    expect(await createWsHandlers(d).onConnect(ctx)).toBe(false)
    expect(d.verifyClerkToken).toHaveBeenCalledWith('wrong')
    expect(close).toHaveBeenCalledWith(4401, 'Unauthorized')
    expect(d.ensureUser).not.toHaveBeenCalled()
  })

  it('a token the check throws on, and the token is never logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error(`JWT is expired: ${TOKEN}`)
    err.name = 'TokenVerificationError'
    const d = deps({ verifyClerkToken: vi.fn(async () => Promise.reject(err)) })
    const { ctx, close } = fakeCtx(GOOD)

    expect(await createWsHandlers(d).onConnect(ctx)).toBe(false)
    expect(close).toHaveBeenCalledWith(4401, 'Unauthorized')
    expect(log).toHaveBeenCalledWith('wsServer: token check failed:', 'TokenVerificationError')
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)
  })

  it('an authorization that is not "Bearer <token>"', async () => {
    const d = deps()
    const { ctx, close } = fakeCtx({ authorization: TOKEN, clientId: 'tab-1' })

    expect(await createWsHandlers(d).onConnect(ctx)).toBe(false)
    expect(d.verifyClerkToken).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledWith(4401, 'Unauthorized')
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too long', 'a'.repeat(65)],
    ['not a string', 42],
  ])('a valid token but a clientId that is %s', async (_label, clientId) => {
    const d = deps()
    const { ctx, close } = fakeCtx({ authorization: `Bearer ${TOKEN}`, clientId })

    expect(await createWsHandlers(d).onConnect(ctx)).toBe(false)
    expect(close).toHaveBeenCalledWith(4401, 'Unauthorized')
    expect(d.ensureUser).not.toHaveBeenCalled()
  })

  it('a refused socket leaves no timer', async () => {
    const { ctx } = fakeCtx({ clientId: 'tab-1' })
    await createWsHandlers(deps()).onConnect(ctx)

    expect(vi.getTimerCount()).toBe(0)
  })

  it('the close code is graphql-ws Unauthorized, which its client does not retry', () => {
    expect(CLOSE_UNAUTHORIZED).toBe(4401)
  })
})

describe('onConnect — who is this', () => {
  it('a good token is accepted, and the User row is made sure of once', async () => {
    const d = deps()
    const handlers = createWsHandlers(d)
    const { ctx, close } = fakeCtx(GOOD)

    expect(await handlers.onConnect(ctx)).toBe(true)
    expect(close).not.toHaveBeenCalled()
    expect(d.ensureUser).toHaveBeenCalledTimes(1)
    expect(d.ensureUser).toHaveBeenCalledWith('clerk-user')
    expect(handlers.context(ctx).userId).toBe('clerk-user')
  })

  it('"bearer" in lower case is accepted', async () => {
    const { ctx } = fakeCtx({ authorization: `bearer ${TOKEN}`, clientId: 'tab-1' })
    expect(await createWsHandlers(deps()).onConnect(ctx)).toBe(true)
  })

  it('outside E2E mode, e2eUserId alone is refused', async () => {
    const d = deps()
    const { ctx, close } = fakeCtx({ e2eUserId: 'attacker-chosen-id', clientId: 'tab-1' })

    expect(await createWsHandlers(d).onConnect(ctx)).toBe(false)
    expect(close).toHaveBeenCalledWith(4401, 'Unauthorized')
    expect(d.ensureUser).not.toHaveBeenCalled()
  })

  it('outside E2E mode, e2eUserId next to a good token is ignored', async () => {
    const d = deps()
    const handlers = createWsHandlers(d)
    const { ctx } = fakeCtx({ ...GOOD, e2eUserId: 'attacker-chosen-id' })

    expect(await handlers.onConnect(ctx)).toBe(true)
    expect(handlers.context(ctx).userId).toBe('clerk-user')
    expect(d.ensureUser).not.toHaveBeenCalledWith('attacker-chosen-id')
  })

  it('in E2E mode, e2eUserId is the user and no token is checked', async () => {
    const d = deps({ e2eTestMode: true })
    const handlers = createWsHandlers(d)
    const { ctx } = fakeCtx({ e2eUserId: 'e2e-user', clientId: 'tab-1' })

    expect(await handlers.onConnect(ctx)).toBe(true)
    expect(handlers.context(ctx).userId).toBe('e2e-user')
    expect(d.verifyClerkToken).not.toHaveBeenCalled()
    expect(d.ensureUser).toHaveBeenCalledWith('e2e-user')
  })

  it('in E2E mode with no e2eUserId, the token decides, like HTTP', async () => {
    const handlers = createWsHandlers(deps({ e2eTestMode: true }))
    const { ctx } = fakeCtx(GOOD)

    expect(await handlers.onConnect(ctx)).toBe(true)
    expect(handlers.context(ctx).userId).toBe('clerk-user')
  })
})

describe('context — one per subscription', () => {
  it('carries the user, the tab id and the language, with a new cache each time', async () => {
    const handlers = createWsHandlers(deps())
    const { ctx } = fakeCtx({ ...GOOD, language: 'tw' })
    await handlers.onConnect(ctx)

    const first = handlers.context(ctx)
    const second = handlers.context(ctx)

    expect(first).toEqual({
      userId: 'clerk-user',
      clientId: 'tab-1',
      language: 'tw',
      requestCache: {},
    })
    expect(second.requestCache).not.toBe(first.requestCache)
  })

  it('a socket that was never accepted has no user', () => {
    const { ctx } = fakeCtx(GOOD)
    expect(createWsHandlers(deps()).context(ctx).userId).toBeNull()
  })
})

describe('the 60-minute limit', () => {
  it('closes the socket at 60 minutes, not at 59, with a code the client retries', async () => {
    const { ctx, close } = fakeCtx(GOOD)
    await createWsHandlers(deps()).onConnect(ctx)

    vi.advanceTimersByTime(59 * 60 * 1000)
    expect(close).not.toHaveBeenCalled()

    vi.advanceTimersByTime(60 * 1000)
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(1001, 'Socket age limit')
    expect(CLOSE_MAX_AGE).toBe(1001)
    expect(SOCKET_MAX_AGE_MS).toBe(60 * 60 * 1000)
  })

  it('a socket that closes early leaves no timer', async () => {
    const handlers = createWsHandlers(deps())
    const { ctx, close } = fakeCtx(GOOD)
    await handlers.onConnect(ctx)
    // The count sees the timer, so the 0 below means something.
    expect(vi.getTimerCount()).toBe(1)

    handlers.onClose(ctx)

    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(SOCKET_MAX_AGE_MS)
    expect(close).not.toHaveBeenCalled()
  })

  it('each socket has its own timer', async () => {
    const handlers = createWsHandlers(deps())
    const a = fakeCtx(GOOD)
    const b = fakeCtx({ ...GOOD, clientId: 'tab-2' })
    await handlers.onConnect(a.ctx)
    await handlers.onConnect(b.ctx)

    handlers.onClose(a.ctx)
    vi.advanceTimersByTime(SOCKET_MAX_AGE_MS)

    expect(a.close).not.toHaveBeenCalled()
    expect(b.close).toHaveBeenCalledWith(1001, 'Socket age limit')
  })
})
