import { describe, expect, it } from 'vitest'
import { GraphQLError } from 'graphql'
import {
  alreadyMember,
  hasInviteTokenLength,
  INVITE_TOKEN_LENGTH,
  INVITE_LIFETIME_DAYS,
  inviteExpiresAt,
  inviteInvalid,
  newInviteToken,
  parseLocationRoles,
} from './invite.js'

// The small helpers of the invite resolvers (households H5b, task G.3).

describe('newInviteToken (decision T12)', () => {
  it('is 43 characters of the base64url alphabet', () => {
    const token = newInviteToken()
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('two calls give two different tokens', () => {
    expect(newInviteToken()).not.toBe(newInviteToken())
  })

  it('INVITE_TOKEN_LENGTH is the length the generator makes', () => {
    expect(INVITE_TOKEN_LENGTH).toBe(43)
    for (let i = 0; i < 20; i++) expect(newInviteToken()).toHaveLength(INVITE_TOKEN_LENGTH)
  })

  it('hasInviteTokenLength accepts that length only', () => {
    expect(hasInviteTokenLength(newInviteToken())).toBe(true)
    expect(hasInviteTokenLength('a'.repeat(42))).toBe(false)
    expect(hasInviteTokenLength('a'.repeat(44))).toBe(false)
    expect(hasInviteTokenLength('')).toBe(false)
  })
})

describe('invite lifetime (owner decision O6-A)', () => {
  it('is 7 days', () => {
    expect(INVITE_LIFETIME_DAYS).toBe(7)
  })

  it('inviteExpiresAt adds 7 days to the time given', () => {
    const now = new Date('2026-11-18T10:00:00.000Z')
    expect(inviteExpiresAt(now).toISOString()).toBe('2026-11-25T10:00:00.000Z')
  })
})

describe('parseLocationRoles', () => {
  it('returns the list as given', () => {
    expect(
      parseLocationRoles([
        { locationId: 'a', role: 'organizer' },
        { locationId: 'b', role: 'viewer' },
      ]),
    ).toEqual([
      { locationId: 'a', role: 'organizer' },
      { locationId: 'b', role: 'viewer' },
    ])
  })

  it('accepts an empty list (owner decision O14-A)', () => {
    expect(parseLocationRoles([])).toEqual([])
  })

  it('keeps only the two known keys', () => {
    expect(parseLocationRoles([{ locationId: 'a', role: 'participant', extra: 1 }])).toEqual([
      { locationId: 'a', role: 'participant' },
    ])
  })

  it('refuses a value that is not a list', () => {
    expect(() => parseLocationRoles({ locationId: 'a', role: 'viewer' })).toThrow(/not a list/)
    expect(() => parseLocationRoles(null)).toThrow(/not a list/)
  })

  it('refuses an entry that is not an object, or has no string locationId', () => {
    expect(() => parseLocationRoles(['a'])).toThrow(/entry 0/)
    expect(() => parseLocationRoles([{ role: 'viewer' }])).toThrow(/locationId/)
    expect(() => parseLocationRoles([{ locationId: '', role: 'viewer' }])).toThrow(/locationId/)
  })

  it('refuses an unknown role, also a household role', () => {
    expect(() => parseLocationRoles([{ locationId: 'a', role: 'owner' }])).toThrow(/role/)
    expect(() => parseLocationRoles([{ locationId: 'a', role: 'boss' }])).toThrow(/role/)
  })

  it('refuses a location named twice', () => {
    expect(() =>
      parseLocationRoles([
        { locationId: 'a', role: 'viewer' },
        { locationId: 'a', role: 'organizer' },
      ]),
    ).toThrow(/twice/)
  })

  it('throws a plain Error, not a GraphQLError', () => {
    let caught: unknown
    try {
      parseLocationRoles('x')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(GraphQLError)
  })
})

describe('error builders (decision T18)', () => {
  it('inviteInvalid is BAD_USER_INPUT with reason INVITE_INVALID', () => {
    const err = inviteInvalid()
    expect(err.extensions).toEqual({ code: 'BAD_USER_INPUT', reason: 'INVITE_INVALID' })
  })

  it('alreadyMember is BAD_USER_INPUT with reason ALREADY_MEMBER', () => {
    const err = alreadyMember()
    expect(err.extensions).toEqual({ code: 'BAD_USER_INPUT', reason: 'ALREADY_MEMBER' })
  })
})
