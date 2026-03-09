import { describe, expect, it } from 'vitest'
import { formatDate } from './formatDate'

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
