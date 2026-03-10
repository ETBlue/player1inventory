import { describe, expect, it } from 'vitest'
import en from './en.json'
import tw from './tw.json'

/**
 * Recursively collect all leaf key paths from a nested object.
 * E.g. { a: { b: 'x' } } → ['a.b']
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

describe('locale files', () => {
  it('en.json and tw.json have the same translation keys', () => {
    // Given both locale files
    const enKeys = collectKeys(en as Record<string, unknown>).sort()
    const twKeys = collectKeys(tw as Record<string, unknown>).sort()

    // When comparing their key sets
    // EN uses _one/_other plural suffixes; TW only uses _other (i18next falls back gracefully)
    const missingInTw = enKeys.filter(
      (k) => !twKeys.includes(k) && !k.endsWith('_one'),
    )
    const missingInEn = twKeys.filter((k) => !enKeys.includes(k))

    // Then they are identical
    expect(missingInTw, 'Keys in en.json missing from tw.json').toEqual([])
    expect(missingInEn, 'Keys in tw.json missing from en.json').toEqual([])
  })
})
