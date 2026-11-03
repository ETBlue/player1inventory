import type { Request, Response } from 'express'
import type { WebhookEvent } from '@clerk/express/webhooks'
import { verifyWebhook } from '@clerk/express/webhooks'
import { prisma } from './prisma.js'
import type { ClerkUserJSON } from './userRow.js'
import { userRowFromClerk } from './userRow.js'

// Clerk user webhooks: `POST /webhooks/clerk` (households plan, task 2.3,
// docs/global/permissions/2026-10-31-households-plan.md).
//
// Clerk sends these through Svix. Each request is signed with
// CLERK_WEBHOOK_SIGNING_SECRET. `verifyWebhook` from `@clerk/express/webhooks`
// checks the signature and refuses a timestamp more than 5 minutes away from
// now (plan P16: no `svix` package).
//
// ── THE ROUTE MUST GET THE RAW BODY ──
//
// The signature covers the exact bytes Clerk sent. `index.ts` mounts this
// handler with `express.raw`, ABOVE the app-wide JSON parser. When the body is
// a Buffer, `verifyWebhook` checks those bytes. When the JSON parser has
// already run, the body is an object, and `verifyWebhook` checks
// `JSON.stringify(body)` instead, which is not always the same bytes. The
// source-text test `src/webhookRouteOrder.test.ts` guards the order.

type UserEvent = { type: 'user.created' | 'user.updated'; data: ClerkUserJSON }
type UserDeletedEvent = { type: 'user.deleted'; data: { id?: string } }
type OtherEvent = {
  type: Exclude<WebhookEvent['type'], UserEvent['type'] | UserDeletedEvent['type']>
  data: unknown
}

/**
 * The events `handleClerkEvent` accepts. Every `WebhookEvent` fits this type,
 * so a verified event can be passed as it is. A test can build one with only
 * the fields the handler reads.
 */
export type ClerkEvent = UserEvent | UserDeletedEvent | OtherEvent

/** The display name of a user whose first event was `user.deleted` (plan P13). */
export const DELETED_USER_DISPLAY_NAME = 'Deleted user'

/**
 * Apply one verified Clerk event to the `User` table.
 *
 * Every branch is an `upsert`, so the order of events and Svix retries do not
 * matter: `user.updated` before `user.created` creates the row, and a repeated
 * event leaves one row.
 *
 * - `user.created`, `user.updated`: write the name and email. `deletedAt` is
 *   not in either payload, so these events never clear it.
 * - `user.deleted`: set `deletedAt`. The stored name and email stay, so logs
 *   can still name the person. For an id with no row, create the row already
 *   deleted, named "Deleted user" (plan P13). Otherwise the request-path
 *   safety net (task 2.4) would create it later as a live user.
 *   H6 adds the household hand-over here.
 * - Any other event: do nothing.
 */
export async function handleClerkEvent(evt: ClerkEvent): Promise<void> {
  switch (evt.type) {
    case 'user.created':
    case 'user.updated': {
      const { id, displayName, email } = userRowFromClerk(evt.data)
      await prisma.user.upsert({
        where: { id },
        create: { id, displayName, email },
        update: { displayName, email },
      })
      return
    }
    case 'user.deleted': {
      const id = evt.data.id
      // Clerk's type allows a deleted object with no id. There is no row to
      // mark, so there is nothing to do.
      if (!id) return
      const deletedAt = new Date()
      await prisma.user.upsert({
        where: { id },
        create: { id, displayName: DELETED_USER_DISPLAY_NAME, deletedAt },
        update: { deletedAt },
      })
      return
    }
    default:
      return
  }
}

/**
 * The Express handler for `POST /webhooks/clerk`. Mount it with
 * `express.raw({ type: 'application/json' })`.
 *
 * | Case | Status | Writes |
 * |---|---|---|
 * | `CLERK_WEBHOOK_SIGNING_SECRET` is not set | 500 | nothing |
 * | the signature, headers or timestamp fail the check | 400 | nothing |
 * | the event was verified but writing it failed | 500, so Svix retries | maybe part |
 * | the event was verified and handled | 200 | the event's row |
 *
 * It never logs the request body or the secret. The log lines carry the
 * event type, the error message from `verifyWebhook` (it names the failed
 * check, not the payload), or a write error's name and code.
 */
export async function clerkWebhookHandler(req: Request, res: Response): Promise<void> {
  // Read on every request, not once at load, so a missing secret is reported
  // as the server's own error instead of as a bad signature.
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
  if (!signingSecret) {
    console.error('Clerk webhook refused: CLERK_WEBHOOK_SIGNING_SECRET is not set')
    res.status(500).json({ error: 'Webhook signing secret is not configured' })
    return
  }

  let evt: WebhookEvent
  try {
    evt = await verifyWebhook(req, { signingSecret })
  } catch (err) {
    console.error(
      'Clerk webhook refused: verification failed:',
      err instanceof Error ? err.message : 'unknown error',
    )
    res.status(400).json({ error: 'Webhook verification failed' })
    return
  }

  try {
    await handleClerkEvent(evt)
  } catch (err) {
    // The error's name and code only, not its message. A Prisma validation
    // error's message prints the whole call, and that includes the email.
    const code = (err as { code?: unknown } | null)?.code
    console.error(
      `Clerk webhook ${evt.type} failed:`,
      err instanceof Error ? err.name : 'unknown error',
      typeof code === 'string' ? code : '',
    )
    res.status(500).json({ error: 'Webhook handling failed' })
    return
  }
  res.status(200).json({ ok: true })
}
