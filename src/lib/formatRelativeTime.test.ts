import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime'

describe('formatRelativeTime', () => {
  const now = new Date()

  function daysAgo(n: number): Date {
    return new Date(now.getTime() - n * 24 * 60 * 60 * 1000)
  }

  it('formats yesterday in English', () => {
    // Given a date 1 day ago
    // When formatted in English
    const result = formatRelativeTime(daysAgo(1), 'en')

    // Then it returns "yesterday"
    expect(result).toBe('yesterday')
  })

  it('formats 3 days ago in English', () => {
    // Given a date 3 days ago
    // When formatted in English
    const result = formatRelativeTime(daysAgo(3), 'en')

    // Then it returns "3 days ago"
    expect(result).toMatch(/3 days? ago/)
  })

  it('formats 2 weeks ago in English', () => {
    // Given a date 14 days ago
    // When formatted in English
    const result = formatRelativeTime(daysAgo(14), 'en')

    // Then it returns "2 weeks ago"
    expect(result).toMatch(/2 weeks? ago/)
  })

  it('formats yesterday in Traditional Chinese', () => {
    // Given a date 1 day ago
    // When formatted in Traditional Chinese
    const result = formatRelativeTime(daysAgo(1), 'tw')

    // Then it returns the Chinese equivalent of "yesterday"
    expect(result).toMatch(/昨天/)
  })

  it('formats 3 days ago in Traditional Chinese', () => {
    // Given a date 3 days ago
    // When formatted in Traditional Chinese
    const result = formatRelativeTime(daysAgo(3), 'tw')

    // Then it returns the Chinese equivalent
    expect(result).toMatch(/3 天前/)
  })

  it('returns different strings for en and tw', () => {
    // Given a date 3 days ago
    // When formatted in different languages
    // Then the results differ
    expect(formatRelativeTime(daysAgo(3), 'en')).not.toBe(
      formatRelativeTime(daysAgo(3), 'tw'),
    )
  })
})
