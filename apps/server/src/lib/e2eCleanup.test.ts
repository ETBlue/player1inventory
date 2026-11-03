import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `DELETE /e2e/cleanup` (lib/e2eCleanup.ts), called directly with a fake
// request and response.
//
// What these tests pin, and what they do not:
// - They pin WHICH models are deleted, in WHICH order, with the `User` row
//   deleted by its `id` and last, and that each count lands under its own key.
// - They pin that `forgetSeenToday` runs once, for this user, and only AFTER
//   the transaction has finished.
// - They do NOT run SQL. The `where` clauses of the 14 older models are
//   checked against real Postgres only by e2e/tests/cleanup-endpoint.spec.ts.

// `vi.mock` factories are hoisted above every other line, so what they share
// with the tests is built in `vi.hoisted`.
const shared = vi.hoisted(() => ({
  /** Every call this file sees, in order: `delete:<model>`, `commit`, `forget:<id>`. */
  events: [] as string[],
  /** The 15 Prisma client names, in the order the route must delete them. */
  MODELS: [
    'inventoryLog',
    'cartItem',
    'cart',
    'itemTag',
    'itemVendor',
    'recipeItem',
    'itemStock',
    'item',
    'tag',
    'tagType',
    'vendor',
    'recipe',
    'shelf',
    'location',
    'user',
  ] as const,
  /**
   * Lets a test hold the transaction open, to check what runs before it
   * finishes. `null` means the transaction finishes at once.
   */
  transactionGate: null as Promise<void> | null,
  transactionError: null as Error | null,
}))
const { events, MODELS } = shared

vi.mock('./prisma.js', () => {
  // Each model's count is its position in MODELS plus 1, so a count that
  // lands under the wrong key is seen.
  const client: Record<string, unknown> = {}
  shared.MODELS.forEach((model, index) => {
    client[model] = {
      deleteMany: vi.fn((args: unknown) => {
        shared.events.push(`delete:${model}`)
        return { model, args, count: index + 1 }
      }),
    }
  })
  // The ARRAY form only, like the route. The array's items are the values the
  // deleteMany fakes returned, already in call order.
  client.$transaction = vi.fn(async (ops: unknown) => {
    if (!Array.isArray(ops)) throw new Error('this fake models only the array form of $transaction')
    if (shared.transactionGate) await shared.transactionGate
    if (shared.transactionError) throw shared.transactionError
    shared.events.push('commit')
    return ops
  })
  return { prisma: client }
})

vi.mock('./userRow.js', () => ({
  forgetSeenToday: vi.fn((userId: string) => {
    shared.events.push(`forget:${userId}`)
  }),
}))

import { prisma } from './prisma.js'
import { forgetSeenToday } from './userRow.js'
import { CLEANUP_MODEL_KEYS, e2eCleanupHandler } from './e2eCleanup.js'

function fakeRequest(userId?: string): Request {
  return { headers: userId === undefined ? {} : { 'x-e2e-user-id': userId } } as unknown as Request
}

function fakeResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

function deleteArgsOf(model: (typeof MODELS)[number]): unknown {
  const client = prisma as unknown as Record<string, { deleteMany: ReturnType<typeof vi.fn> }>
  return client[model]?.deleteMany.mock.calls[0]?.[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  events.length = 0
  shared.transactionGate = null
  shared.transactionError = null
})

describe('e2eCleanupHandler', () => {
  it('answers 400 without the user header, deletes nothing and forgets no one', async () => {
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest(), res as unknown as Response)

    expect(res.statusCode).toBe(400)
    expect(events).toEqual([])
  })

  it('deletes the 15 models in order, with the User row last and by its id', async () => {
    // When the cleanup runs for one user
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    // Then every model is deleted once, children before parents, User last
    expect(events.filter((e) => e.startsWith('delete:'))).toEqual(
      MODELS.map((model) => `delete:${model}`),
    )
    // And the User row is picked by its id: it has no userId column
    expect(deleteArgsOf('user')).toEqual({ where: { id: 'e2e-user-1' } })
    // And one model with a userId keeps its old filter, as a control
    expect(deleteArgsOf('shelf')).toEqual({ where: { userId: 'e2e-user-1' } })
  })

  it('returns each count under its own key, users included', async () => {
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    // The fake gives the model at position i a count of i + 1
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      deleted: Object.fromEntries(CLEANUP_MODEL_KEYS.map((key, index) => [key, index + 1])),
    })
    expect(CLEANUP_MODEL_KEYS).toHaveLength(15)
    expect(CLEANUP_MODEL_KEYS[14]).toBe('users')
  })

  it('forgets the user only after the transaction has finished', async () => {
    // Given a transaction that is held open
    let finish: () => void = () => {}
    shared.transactionGate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const res = fakeResponse()
    const run = e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    // While it is open, the memory is not touched
    await vi.waitFor(() => expect(prisma.$transaction).toHaveBeenCalledTimes(1))
    expect(forgetSeenToday).not.toHaveBeenCalled()

    // When it finishes
    finish()
    await run

    // Then the user is forgotten once, after the commit
    expect(events.slice(-2)).toEqual(['commit', 'forget:e2e-user-1'])
    expect(forgetSeenToday).toHaveBeenCalledTimes(1)
  })

  it('forgets no one when the transaction fails, because nothing was deleted', async () => {
    shared.transactionError = new Error('connection lost')

    await expect(
      e2eCleanupHandler(fakeRequest('e2e-user-1'), fakeResponse() as unknown as Response),
    ).rejects.toThrow('connection lost')
    expect(forgetSeenToday).not.toHaveBeenCalled()
  })
})

describe('the cleanup keys match the E2E helper', () => {
  it('lists the same keys, in the same order, as CLEANUP_MODEL_KEYS in e2e/helpers/cloudTeardown.ts', () => {
    // The E2E helper cannot import from the server, so it keeps its own copy.
    // This reads that copy as text, so the two lists cannot drift apart.
    const here = dirname(fileURLToPath(import.meta.url))
    const helper = readFileSync(resolve(here, '../../../../e2e/helpers/cloudTeardown.ts'), 'utf8')
    const block = helper.match(/CLEANUP_MODEL_KEYS = \[([\s\S]*?)\] as const/)?.[1]
    expect(block).toBeDefined()
    const keys = [...(block ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1])
    expect(keys).toEqual([...CLEANUP_MODEL_KEYS])
  })
})
