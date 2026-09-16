import { describe, expect, it } from 'vitest'
import {
  formatRelativeTime,
  formatRelativeTimeWithHours,
} from './formatRelativeTime'

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

describe('formatRelativeTimeWithHours', () => {
  const now = new Date()

  function minutesAgo(n: number): Date {
    return new Date(now.getTime() - n * 60 * 1000)
  }

  it('formats minutes in English', () => {
    // Given a date 12 minutes ago
    // When formatted in English
    const result = formatRelativeTimeWithHours(minutesAgo(12), 'en')

    // Then it counts in minutes, which formatRelativeTime would call "today"
    expect(result).toMatch(/12 minutes? ago/)
  })

  it('formats hours in English', () => {
    // Given a date 2 hours ago
    // When formatted in English
    const result = formatRelativeTimeWithHours(minutesAgo(120), 'en')

    // Then it counts in hours
    expect(result).toMatch(/2 hours? ago/)
  })

  it('formats hours in Traditional Chinese', () => {
    // Given a date 2 hours ago
    // When formatted in Traditional Chinese
    const result = formatRelativeTimeWithHours(minutesAgo(120), 'tw')

    // Then the text is Chinese. 'tw' alone is the Twi subtag and would
    // silently give English, so the LANGUAGE_LOCALE mapping is what is
    // being checked here.
    expect(result).toMatch(/2 小時前/)
  })

  it('hands anything a day old or older to formatRelativeTime', () => {
    // Given a date 3 days ago
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

    // When formatted both ways
    // Then the two agree — there is one implementation of the day wording
    expect(formatRelativeTimeWithHours(threeDaysAgo, 'tw')).toBe(
      formatRelativeTime(threeDaysAgo, 'tw'),
    )
  })
})
