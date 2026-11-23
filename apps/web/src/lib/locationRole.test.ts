import { describe, expect, it } from 'vitest'
import { locationRoleAtLeast } from './locationRole'

describe('locationRoleAtLeast', () => {
  it('a higher role passes a lower check, a lower one does not', () => {
    expect(locationRoleAtLeast('organizer', 'participant')).toBe(true)
    expect(locationRoleAtLeast('participant', 'participant')).toBe(true)
    expect(locationRoleAtLeast('viewer', 'participant')).toBe(false)
    expect(locationRoleAtLeast('participant', 'organizer')).toBe(false)
  })

  it('no role is never enough, not even for viewer', () => {
    expect(locationRoleAtLeast(null, 'viewer')).toBe(false)
    expect(locationRoleAtLeast(undefined, 'viewer')).toBe(false)
  })
})
