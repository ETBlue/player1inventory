import { createHmac, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The webhook writes through `prisma.user`. Here that is the stateful `User`
// double from src/test/userFake.ts, so each test can read back exactly which
// rows exist after an event.
vi.mock('./prisma.js', async () => {
  const { createUserFake } = await import('../test/userFake.js')
  const userFake = createUserFake()
  return { prisma: { user: userFake.client, $userFake: userFake } }
})

import { prisma } from './prisma.js'
import type { UserFake, UserRow } from '../test/userFake.js'
import type { ClerkEvent } from './clerkWebhook.js'
import { clerkWebhookHandler, handleClerkEvent } from './clerkWebhook.js'
import type { ClerkUserJSON } from './userRow.js'

const userFake = (prisma as unknown as { $userFake: UserFake }).$userFake

function clerkUser(id: string, extra: Partial<ClerkUserJSON> = {}): ClerkUserJSON {
  return {
    id,
    first_name: 'ET',
    last_name: 'Blue',
    primary_email_address_id: 'idn_1',
    email_addresses: [{ id: 'idn_1', email_address: 'etblue@example.com' }],
    ...extra,
  }
}

function storedRow(id: string, extra: Partial<UserRow> = {}): UserRow {
  return {
    id,
    displayName: 'Stored Name',
    email: 'stored@example.com',
    lastSeenAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...extra,
  }
}

describe('handleClerkEvent', () => {
  beforeEach(() => {
    userFake.reset()
  })

  it('user.created creates the row with the name and email from Clerk', async () => {
    // Given no User row
    // When user.created arrives
    await handleClerkEvent({ type: 'user.created', data: clerkUser('user_1') })

    // Then one row exists with Clerk's values and no deletedAt
    expect(userFake.state.rows).toHaveLength(1)
    expect(userFake.state.rows[0]).toMatchObject({
      id: 'user_1',
      displayName: 'ET Blue',
      email: 'etblue@example.com',
      deletedAt: null,
    })
  })

  it('user.updated changes the name and email of an existing row', async () => {
    // Given a stored row
    userFake.reset([storedRow('user_1')])

    // When user.updated arrives with a new name and email
    await handleClerkEvent({
      type: 'user.updated',
      data: clerkUser('user_1', {
        first_name: 'New',
        last_name: 'Name',
        email_addresses: [{ id: 'idn_1', email_address: 'new@example.com' }],
      }),
    })

    // Then the row holds the new values
    expect(userFake.state.rows).toHaveLength(1)
    expect(userFake.state.rows[0]).toMatchObject({
      displayName: 'New Name',
      email: 'new@example.com',
    })
  })

  it('user.updated before user.created still creates the row', async () => {
    // Given no User row (Svix does not promise delivery order)
    // When user.updated arrives first
    await handleClerkEvent({ type: 'user.updated', data: clerkUser('user_1') })

    // Then the row is created
    expect(userFake.state.rows.map((r) => r.id)).toEqual(['user_1'])

    // And a later user.created does not fail and leaves one row
    await handleClerkEvent({ type: 'user.created', data: clerkUser('user_1') })
    expect(userFake.state.rows).toHaveLength(1)
  })

  it('a repeated user.created (a Svix retry) leaves one row and does not throw', async () => {
    // Given user.created was already handled
    await handleClerkEvent({ type: 'user.created', data: clerkUser('user_1') })

    // When the same event arrives again
    await handleClerkEvent({ type: 'user.created', data: clerkUser('user_1') })

    // Then there is still one row
    expect(userFake.state.rows).toHaveLength(1)
  })

  it('user.updated never clears deletedAt', async () => {
    // Given a row that a user.deleted already marked
    const deletedAt = new Date('2026-10-01T00:00:00.000Z')
    userFake.reset([storedRow('user_1', { deletedAt })])

    // When a late user.updated arrives
    await handleClerkEvent({ type: 'user.updated', data: clerkUser('user_1') })

    // Then deletedAt is unchanged
    expect(userFake.state.rows[0]?.deletedAt).toEqual(deletedAt)
  })

  it('user.deleted sets deletedAt and keeps the stored name and email', async () => {
    // Given a stored row
    userFake.reset([storedRow('user_1')])

    // When user.deleted arrives (it carries only the id)
    await handleClerkEvent({ type: 'user.deleted', data: { id: 'user_1' } })

    // Then deletedAt is set and the name and email stay, so logs can still
    // show who did what
    const row = userFake.state.rows[0]
    expect(row?.deletedAt).toBeInstanceOf(Date)
    expect(row).toMatchObject({ displayName: 'Stored Name', email: 'stored@example.com' })
  })

  it('user.deleted for an unknown id creates the row as "Deleted user" with deletedAt set', async () => {
    // Given no User row for this id (P13)
    // When user.deleted arrives
    await handleClerkEvent({ type: 'user.deleted', data: { id: 'user_gone' } })

    // Then a row exists, already marked deleted, so the safety net cannot
    // bring the user back as alive
    expect(userFake.state.rows).toHaveLength(1)
    const row = userFake.state.rows[0]
    expect(row).toMatchObject({ id: 'user_gone', displayName: 'Deleted user', email: null })
    expect(row?.deletedAt).toBeInstanceOf(Date)
  })

  it('user.deleted with no id writes nothing and does not throw', async () => {
    // Given a user.deleted payload with no id (the type allows it)
    // When it is handled
    await handleClerkEvent({ type: 'user.deleted', data: {} })

    // Then nothing is written
    expect(userFake.state.rows).toEqual([])
  })

  it('an event type it does not handle writes nothing and does not throw', async () => {
    // Given a stored row
    userFake.reset([storedRow('user_1')])
    const before = structuredClone(userFake.state.rows)

    // When an unrelated event arrives
    await handleClerkEvent({ type: 'session.created', data: { id: 'sess_1' } })

    // Then the store is unchanged
    expect(userFake.state.rows).toEqual(before)
  })
})

// ── The route ──
//
// A real Express app on a free port, with the same `express.raw` parser the
// production route uses, so the handler sees the body as the bytes that were
// signed.

const ROUTE = '/webhooks/clerk'

function randomSecret(): string {
  // A fresh random value for each run. Never a real secret.
  return `whsec_${randomBytes(24).toString('base64')}`
}

/** Sign a body the way Svix does: base64 HMAC-SHA256 of `id.timestamp.body`. */
function svixHeaders(secret: string, body: string, timestamp: number) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const svixId = `msg_${randomBytes(8).toString('hex')}`
  const signature = createHmac('sha256', key)
    .update(`${svixId}.${timestamp}.${body}`)
    .digest('base64')
  return {
    'content-type': 'application/json',
    'svix-id': svixId,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

describe('clerkWebhookHandler', () => {
  let server: Server
  let url: string
  const secret = randomSecret()
  const body = JSON.stringify({
    type: 'user.created',
    object: 'event',
    data: clerkUser('user_1'),
  })

  beforeAll(async () => {
    const app = express()
    app.post(ROUTE, express.raw({ type: 'application/json' }), clerkWebhookHandler)
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s))
    })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${ROUTE}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  beforeEach(() => {
    userFake.reset()
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', secret)
    // Keep the expected error lines out of the test output.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('a correctly signed event returns 200 and writes the row', async () => {
    // Given a body signed with the configured secret
    // When it is posted
    const res = await fetch(url, {
      method: 'POST',
      headers: svixHeaders(secret, body, nowSeconds()),
      body,
    })

    // Then it is accepted and handled
    expect(res.status).toBe(200)
    expect(userFake.state.rows.map((r) => r.id)).toEqual(['user_1'])
  })

  it('a body signed with another secret returns 400 and writes nothing', async () => {
    // Given a body signed with a DIFFERENT secret
    const headers = svixHeaders(randomSecret(), body, nowSeconds())

    // When it is posted
    const res = await fetch(url, { method: 'POST', headers, body })

    // Then it is refused and the store is still empty
    expect(res.status).toBe(400)
    expect(userFake.state.rows).toEqual([])
  })

  it('a body changed after signing returns 400 and writes nothing', async () => {
    // Given headers signed for one body, sent with another
    const headers = svixHeaders(secret, body, nowSeconds())
    const forged = body.replace('user_1', 'user_2')

    // When it is posted
    const res = await fetch(url, { method: 'POST', headers, body: forged })

    // Then it is refused and the store is still empty
    expect(res.status).toBe(400)
    expect(userFake.state.rows).toEqual([])
  })

  it('a correctly signed event with a timestamp 10 minutes old returns 400', async () => {
    // Given a good signature over an old timestamp (a replay)
    const headers = svixHeaders(secret, body, nowSeconds() - 10 * 60)

    // When it is posted
    const res = await fetch(url, { method: 'POST', headers, body })

    // Then it is refused and nothing is written
    expect(res.status).toBe(400)
    expect(userFake.state.rows).toEqual([])
  })

  it('returns 500 and writes nothing when CLERK_WEBHOOK_SIGNING_SECRET is not set', async () => {
    // Given no signing secret in the environment
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', undefined)

    // When a correctly signed event is posted
    const res = await fetch(url, {
      method: 'POST',
      headers: svixHeaders(secret, body, nowSeconds()),
      body,
    })

    // Then the server reports its own setup error, not the caller's
    expect(process.env.CLERK_WEBHOOK_SIGNING_SECRET).toBeUndefined()
    expect(res.status).toBe(500)
    expect(userFake.state.rows).toEqual([])
  })

  it('never writes the request body or the secret to the log', async () => {
    // Given a refused request (the path that logs)
    const headers = svixHeaders(randomSecret(), body, nowSeconds())

    // When it is posted
    await fetch(url, { method: 'POST', headers, body })

    // Then something was logged (so the check below is not run on an empty
    // log), and nothing logged contains the secret or the user's email
    expect(console.error).toHaveBeenCalled()
    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((part) => String(part))
      .join('\n')
    expect(logged).not.toContain(secret.slice('whsec_'.length))
    expect(logged).not.toContain('etblue@example.com')
  })

  it('a write that fails returns 500 and logs the error name and code, not its message', async () => {
    // Given the database write fails with an error whose MESSAGE holds the
    // payload, the way a Prisma validation error prints the whole call
    const failure = Object.assign(new Error('Invalid upsert: { email: "etblue@example.com" }'), {
      name: 'PrismaClientValidationError',
      code: 'P2000',
    })
    vi.spyOn(userFake.client, 'upsert').mockRejectedValueOnce(failure)

    // When a correctly signed event is posted
    const res = await fetch(url, {
      method: 'POST',
      headers: svixHeaders(secret, body, nowSeconds()),
      body,
    })

    // Then the status asks Svix to retry, and the log names the error
    // without the email
    expect(res.status).toBe(500)
    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((part) => String(part))
      .join('\n')
    expect(logged).toContain('PrismaClientValidationError')
    expect(logged).toContain('P2000')
    expect(logged).not.toContain('etblue@example.com')
  })
})
