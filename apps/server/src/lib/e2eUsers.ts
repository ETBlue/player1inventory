import type { Request, Response } from 'express'
import { handleClerkEvent } from './clerkWebhook.js'
import { prisma } from './prisma.js'

// E2E-only routes that write `User` rows (households plan, task 2.5,
// docs/global/permissions/2026-10-31-households-plan.md).
//
// | Route | What it does |
// |---|---|
// | `POST /e2e/users` | upsert a `User` row from `{ id, displayName, email? }` |
// | `POST /e2e/users/:id/deleted` | apply a `user.deleted` event, as if Clerk had sent it |
//
// `index.ts` mounts both ONLY inside its `if (E2E_TEST_MODE)` block.
// `src/webhookRouteOrder.test.ts` guards that. They check no signature: the
// second route calls `handleClerkEvent` directly, at the point the real
// webhook reaches after its signature check. So no test signing secret
// exists anywhere, and none can reach production.
//
// ── NO forgetSeenToday HERE ──
//
// `ensureUser` remembers, per process, the users it saw today
// (`lib/userRow.ts`). That memory is only wrong when a row it saw is
// removed: then the next request skips the check and the row is not created
// again. Neither route removes a row. Both upsert, so a row that existed
// still exists afterwards. Task 2.6's `/e2e/cleanup` deletes the row, and it
// is the one that must call `forgetSeenToday`.
//
// Neither route ever logs the request body. A write error is logged by name
// and code only, because a Prisma error's message prints the whole call, and
// that includes the email.

/** The body `POST /e2e/users` accepts. */
export type E2eUserBody = { id: string; displayName: string; email: string | null }

/**
 * Check the body of `POST /e2e/users`. Returns the values, or `null` when the
 * body is not `{ id: string, displayName: string, email?: string | null }`
 * with a non-empty `id` and `displayName`.
 */
export function parseE2eUserBody(body: unknown): E2eUserBody | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const { id, displayName, email } = body as Record<string, unknown>
  if (typeof id !== 'string' || id === '') return null
  if (typeof displayName !== 'string' || displayName === '') return null
  if (email !== undefined && email !== null && typeof email !== 'string') return null
  return { id, displayName, email: email ?? null }
}

function logWriteError(route: string, err: unknown): void {
  const code = (err as { code?: unknown } | null)?.code
  console.error(
    `${route} failed:`,
    err instanceof Error ? err.name : 'unknown error',
    typeof code === 'string' ? code : '',
  )
}

/**
 * `POST /e2e/users`. Creates the row, or updates its name and email. Like
 * the `user.updated` webhook, it never clears `deletedAt` and never writes
 * `lastSeenAt`.
 */
export async function e2eCreateUserHandler(req: Request, res: Response): Promise<void> {
  const values = parseE2eUserBody(req.body)
  if (!values) {
    res.status(400).json({
      error: 'Body must be { id: string, displayName: string, email?: string }',
    })
    return
  }
  const { id, displayName, email } = values
  try {
    await prisma.user.upsert({
      where: { id },
      create: { id, displayName, email },
      update: { displayName, email },
    })
  } catch (err) {
    logWriteError('POST /e2e/users', err)
    res.status(500).json({ error: 'Could not write the User row' })
    return
  }
  res.status(200).json({ ok: true })
}

/**
 * `POST /e2e/users/:id/deleted`. Applies a `user.deleted` event for `:id`
 * through `handleClerkEvent`, the same function the real webhook calls.
 */
export async function e2eUserDeletedHandler(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const { id } = req.params
  try {
    await handleClerkEvent({ type: 'user.deleted', data: { id } })
  } catch (err) {
    logWriteError('POST /e2e/users/:id/deleted', err)
    res.status(500).json({ error: 'Could not apply user.deleted' })
    return
  }
  res.status(200).json({ ok: true })
}
