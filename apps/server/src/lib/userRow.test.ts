import { describe, expect, it } from 'vitest'
import type { ClerkUserJSON } from './userRow.js'
import { userRowFromClerk } from './userRow.js'

// The Clerk user JSON with only the fields `userRowFromClerk` reads. Every
// test starts from this and changes one thing.
function clerkUser(extra: Partial<ClerkUserJSON> = {}): ClerkUserJSON {
  return {
    id: 'user_abc',
    first_name: 'ET',
    last_name: 'Blue',
    primary_email_address_id: 'idn_primary',
    email_addresses: [
      { id: 'idn_other', email_address: 'other@example.com' },
      { id: 'idn_primary', email_address: 'etblue@example.com' },
    ],
    ...extra,
  }
}

describe('userRowFromClerk', () => {
  it('joins the first and last name into the display name', () => {
    // Given a Clerk user with a first and a last name
    // When it is turned into a User row
    const row = userRowFromClerk(clerkUser())

    // Then the display name is both names with one space
    expect(row).toEqual({ id: 'user_abc', displayName: 'ET Blue', email: 'etblue@example.com' })
  })

  it('uses only the first name when there is no last name', () => {
    // Given a Clerk user with a first name and an empty last name
    const row = userRowFromClerk(clerkUser({ last_name: '' }))

    // Then the display name has no trailing space
    expect(row.displayName).toBe('ET')
  })

  it('picks the email named by primary_email_address_id, not the first one in the list', () => {
    // Given two email addresses, where the primary one is listed SECOND
    const row = userRowFromClerk(clerkUser())

    // Then the primary one is stored
    expect(row.email).toBe('etblue@example.com')
  })

  it('stores no email when the primary id names no address in the list', () => {
    // Given a primary id that matches none of the addresses
    const row = userRowFromClerk(clerkUser({ primary_email_address_id: 'idn_gone' }))

    // Then no email is stored (P10: email is optional)
    expect(row.email).toBeNull()
  })

  it('falls back to the part of the email before @ when there is no name', () => {
    // Given a Clerk user with no first or last name
    const row = userRowFromClerk(clerkUser({ first_name: null, last_name: null }))

    // Then the display name is the email's local part (P10)
    expect(row.displayName).toBe('etblue')
  })

  it('falls back to "User" when there is no name and no email', () => {
    // Given a Clerk user with no name and no email address (phone sign-in)
    const row = userRowFromClerk(
      clerkUser({
        first_name: null,
        last_name: null,
        primary_email_address_id: null,
        email_addresses: [],
      }),
    )

    // Then the display name is "User" and no email is stored (P10)
    expect(row).toEqual({ id: 'user_abc', displayName: 'User', email: null })
  })

  it('treats a name of only spaces as no name', () => {
    // Given names that are only spaces
    const row = userRowFromClerk(clerkUser({ first_name: '  ', last_name: ' ' }))

    // Then the email fallback is used, not a blank display name
    expect(row.displayName).toBe('etblue')
  })
})
