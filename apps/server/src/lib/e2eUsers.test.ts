import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// All three routes use `prisma.user`. Here that is the stateful `User`
// double from src/test/userFake.ts, so a test can read back exactly which
// rows exist after a request.
vi.mock('./prisma.js', async () => {
  const { createUserFake } = await import('../test/userFake.js')
  const userFake = createUserFake()
  return { prisma: { user: userFake.client, $userFake: userFake } }
})

import { prisma } from './prisma.js'
import type { UserFake, UserRow } from '../test/userFake.js'
import { DELETED_USER_DISPLAY_NAME } from './clerkWebhook.js'
import {
  e2eCreateUserHandler,
  e2eReadUserHandler,
  e2eUserDeletedHandler,
  parseE2eUserBody,
} from './e2eUsers.js'

const userFake = (prisma as unknown as { $userFake: UserFake }).$userFake

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

function rowOf(id: string): UserRow | undefined {
  return userFake.state.rows.find((r) => r.id === id)
}

describe('parseE2eUserBody', () => {
  it('accepts an id and a display name, with no email', () => {
    expect(parseE2eUserBody({ id: 'u1', displayName: 'Second User' })).toEqual({
      id: 'u1',
      displayName: 'Second User',
      email: null,
    })
  })

  it('accepts an email when it is a string', () => {
    expect(parseE2eUserBody({ id: 'u1', displayName: 'A', email: 'a@example.com' })).toEqual({
      id: 'u1',
      displayName: 'A',
      email: 'a@example.com',
    })
  })

  it.each([
    ['no body', undefined],
    ['null', null],
    ['an array', [{ id: 'u1', displayName: 'A' }]],
    ['a string', 'u1'],
    ['no id', { displayName: 'A' }],
    ['an empty id', { id: '', displayName: 'A' }],
    ['a number id', { id: 1, displayName: 'A' }],
    ['no display name', { id: 'u1' }],
    ['an empty display name', { id: 'u1', displayName: '' }],
    ['a number display name', { id: 'u1', displayName: 2 }],
    ['a number email', { id: 'u1', displayName: 'A', email: 3 }],
  ])('refuses %s', (_label, body) => {
    expect(parseE2eUserBody(body)).toBeNull()
  })
})

describe('the E2E user routes', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    // The same two lines index.ts uses: the app-wide JSON parser, then the routes
    const app = express()
    app.use(express.json())
    app.post('/e2e/users', e2eCreateUserHandler)
    app.post('/e2e/users/:id/deleted', e2eUserDeletedHandler)
    app.get('/e2e/users/:id', e2eReadUserHandler)
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s))
    })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  beforeEach(() => {
    userFake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function postUser(body: unknown) {
    return fetch(`${base}/e2e/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('POST /e2e/users creates the row', async () => {
    // Given no row
    // When a user is posted
    const res = await postUser({ id: 'e2e-u2', displayName: 'Second', email: 'b@example.com' })

    // Then it is created with those values, and lastSeenAt is not set
    expect(res.status).toBe(200)
    expect(rowOf('e2e-u2')).toMatchObject({
      displayName: 'Second',
      email: 'b@example.com',
      lastSeenAt: null,
      deletedAt: null,
    })
  })

  it('POST /e2e/users updates an existing row and keeps one row', async () => {
    // Given a stored row
    userFake.reset([storedRow('e2e-u2')])

    // When the same id is posted with a new name
    const res = await postUser({ id: 'e2e-u2', displayName: 'Renamed' })

    // Then the one row has the new name and no email
    expect(res.status).toBe(200)
    expect(userFake.state.rows).toHaveLength(1)
    expect(rowOf('e2e-u2')).toMatchObject({ displayName: 'Renamed', email: null })
  })

  it('POST /e2e/users never clears deletedAt', async () => {
    // Given a deleted row
    const deletedAt = new Date('2026-10-30T09:00:00.000Z')
    userFake.reset([storedRow('e2e-u2', { deletedAt })])

    // When the same id is posted again
    await postUser({ id: 'e2e-u2', displayName: 'Back' })

    // Then it is still deleted
    expect(rowOf('e2e-u2')?.deletedAt).toEqual(deletedAt)
  })

  it('POST /e2e/users answers 400 to a bad body, writes nothing and logs no body', async () => {
    // Given a body with a number id and an email to look for in the log
    // When it is posted
    const res = await postUser({ id: 42, displayName: 'A', email: 'secret@example.com' })

    // Then it is refused, nothing is written, and the body is not logged
    expect(res.status).toBe(400)
    expect(userFake.state.rows).toEqual([])
    // NEGATIVE CONTROL, not evidence. The 400 path logs nothing at all, so
    // this check cannot fail today. It is kept so that a log line added to
    // the 400 path later cannot print the body.
    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((part) => String(part))
      .join('\n')
    expect(logged).not.toContain('secret@example.com')
  })

  it('POST /e2e/users logs a write error by name and code only, not the email', async () => {
    // Given a database write that fails with an error whose message holds the email
    vi.spyOn(userFake.client, 'upsert').mockRejectedValueOnce(
      Object.assign(new Error('upsert({ email: "secret@example.com" }) failed'), { code: 'P1001' }),
    )

    // When a user is posted
    const res = await postUser({ id: 'e2e-u2', displayName: 'A', email: 'secret@example.com' })

    // Then the answer is 500, and the log has the code but not the email
    expect(res.status).toBe(500)
    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((part) => String(part))
      .join('\n')
    expect(logged).toContain('P1001')
    expect(logged).not.toContain('secret@example.com')
  })

  it('POST /e2e/users/:id/deleted sets deletedAt and keeps the name', async () => {
    // Given a live row
    userFake.reset([storedRow('e2e-u2')])

    // When a fake deletion is sent
    const res = await fetch(`${base}/e2e/users/e2e-u2/deleted`, { method: 'POST' })

    // Then the row is marked deleted, as the real webhook would mark it
    expect(res.status).toBe(200)
    expect(rowOf('e2e-u2')?.deletedAt).toBeInstanceOf(Date)
    expect(rowOf('e2e-u2')?.displayName).toBe('Stored Name')
  })

  it('POST /e2e/users/:id/deleted for an unknown id creates a deleted row (P13)', async () => {
    // Given no row
    // When a fake deletion is sent
    const res = await fetch(`${base}/e2e/users/e2e-u9/deleted`, { method: 'POST' })

    // Then the row exists, already deleted, named as the webhook names it
    expect(res.status).toBe(200)
    expect(rowOf('e2e-u9')).toMatchObject({ displayName: DELETED_USER_DISPLAY_NAME })
    expect(rowOf('e2e-u9')?.deletedAt).toBeInstanceOf(Date)
  })

  it('GET /e2e/users/:id answers the stored row, with dates as ISO strings', async () => {
    // Given a deleted row that was seen once, and a second row
    userFake.reset([
      storedRow('e2e-u2', {
        lastSeenAt: new Date('2026-10-31T08:00:00.000Z'),
        deletedAt: new Date('2026-10-31T09:00:00.000Z'),
      }),
      storedRow('e2e-other', { displayName: 'Other' }),
    ])

    // When the first row is read
    const res = await fetch(`${base}/e2e/users/e2e-u2`)

    // Then the answer is that row, and only that row
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      user: {
        id: 'e2e-u2',
        displayName: 'Stored Name',
        email: 'stored@example.com',
        lastSeenAt: '2026-10-31T08:00:00.000Z',
        deletedAt: '2026-10-31T09:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })
  })

  it('GET /e2e/users/:id answers { user: null } for an id with no row', async () => {
    // Given a row for another id only
    userFake.reset([storedRow('e2e-other')])

    // When an unknown id is read
    const res = await fetch(`${base}/e2e/users/e2e-u9`)

    // Then the answer is 200 with no user, so a spec can check a row is absent
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: null })
  })

  it('GET /e2e/users/:id writes nothing', async () => {
    // Given a row never seen
    userFake.reset([storedRow('e2e-u2')])

    // When it is read
    await fetch(`${base}/e2e/users/e2e-u2`)

    // Then it is unchanged: reading does not count as a visit
    expect(userFake.state.rows).toEqual([storedRow('e2e-u2')])
  })

  it('GET /e2e/users/:id logs a read error by name and code only, not the email', async () => {
    // Given a read that fails with an error whose message holds the email
    vi.spyOn(userFake.client, 'findUnique').mockRejectedValueOnce(
      Object.assign(new Error('findUnique({ email: "secret@example.com" }) failed'), {
        code: 'P1001',
      }),
    )

    // When the row is read
    const res = await fetch(`${base}/e2e/users/e2e-u2`)

    // Then the answer is 500, and the log has the code but not the email
    expect(res.status).toBe(500)
    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((part) => String(part))
      .join('\n')
    expect(logged).toContain('P1001')
    expect(logged).not.toContain('secret@example.com')
  })
})
