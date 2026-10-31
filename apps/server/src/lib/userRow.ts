import type { WebhookEvent } from '@clerk/express/webhooks'

// The `User` row's values, built from what Clerk knows about a person.
// Households plan, tasks 2.3 and 2.4
// (docs/global/permissions/2026-10-31-households-plan.md).

/** Clerk's `UserJSON`, as the `user.created` / `user.updated` webhook sends it. */
type FullClerkUserJSON = Extract<WebhookEvent, { type: 'user.created' | 'user.updated' }>['data']

/**
 * Only the fields `userRowFromClerk` reads. A full `UserJSON` fits this type,
 * so the webhook can pass its payload as it is, and a test can build one with
 * only these fields.
 */
export type ClerkUserJSON = Pick<
  FullClerkUserJSON,
  'id' | 'first_name' | 'last_name' | 'primary_email_address_id'
> & {
  email_addresses: Array<Pick<FullClerkUserJSON['email_addresses'][number], 'id' | 'email_address'>>
}

/** The columns of a `User` row that come from Clerk. */
export type ClerkUserValues = {
  id: string
  displayName: string
  email: string | null
}

/** The display name when Clerk has no name and no email (plan P10). */
export const FALLBACK_DISPLAY_NAME = 'User'

/**
 * Turn a Clerk user into the values the `User` row stores.
 *
 * - `email` is the address named by `primary_email_address_id`. When no
 *   address has that id, `email` is `null`. It does not fall back to another
 *   address, because that one is not the address the person chose.
 * - `displayName` is the first and last name joined by one space. With no
 *   name, it is the part of the email before `@`. With no name and no email,
 *   it is `"User"` (plan P10). A name of only spaces counts as no name.
 */
export function userRowFromClerk(user: ClerkUserJSON): ClerkUserValues {
  const primary = user.email_addresses.find((a) => a.id === user.primary_email_address_id)
  const email = primary?.email_address ?? null

  const name = [user.first_name, user.last_name]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ')
  const emailLocalPart = email?.split('@')[0] ?? ''

  return {
    id: user.id,
    displayName: name || emailLocalPart || FALLBACK_DISPLAY_NAME,
    email,
  }
}
