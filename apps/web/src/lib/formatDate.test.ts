import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './formatDate'

describe('formatDate', () => {
  const date = new Date('2026-03-09T00:00:00Z')

  it('formats date in English', () => {
    // Given a date
    // When formatted in English
    const result = formatDate(date, 'en')

    // Then it contains year, day number, and English month name
    expect(result).toMatch(/2026/)
    expect(result).toMatch(/9/)
    expect(result).toMatch(/Mar|March/)
  })

  it('formats date in Traditional Chinese', () => {
    // Given a date
    // When formatted in Traditional Chinese
    const result = formatDate(date, 'tw')

    // Then it uses CJK date format with 年月日 characters
    expect(result).toMatch(/2026/)
    expect(result).toMatch(/年/)
    expect(result).toMatch(/月/)
    expect(result).toMatch(/日/)
  })

  it('returns different format strings for en and tw', () => {
    // Given a date
    // When formatted in both languages
    // Then the results are different
    expect(formatDate(date, 'en')).not.toBe(formatDate(date, 'tw'))
  })
})

describe('formatDateTime', () => {
  const date = new Date('2026-03-09T14:05:00Z')

  it('formats the date and the time in English', () => {
    // The minutes are the same in every time zone the tests may run in
    const result = formatDateTime(date, 'en')
    expect(result).toMatch(/2026/)
    expect(result).toMatch(/Mar/)
    expect(result).toMatch(/:05/)
  })

  it('formats the date and the time in Traditional Chinese', () => {
    const result = formatDateTime(date, 'tw')
    expect(result).toMatch(/2026年/)
    expect(result).toMatch(/:05/)
  })

  it('gives an empty text for a date that is not valid', () => {
    // Intl throws a RangeError for an invalid date; a log row must not
    // break the page for that
    expect(formatDateTime(new Date('not a date'), 'en')).toBe('')
  })
})
