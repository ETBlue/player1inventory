// Behaviour tests for `isStockActive` in `@p1i/types`
// (`packages/types/src/index.ts`).
//
// It decides if an item is active at one location. A boolean `isActive`
// decides. A missing or `null` value is old data, and it keeps the old rule:
// active when the target is not 0. `packages/types` has no test runner of its
// own, so these tests live here and run in `pnpm test` (the server suite).
import { isStockActive } from '@p1i/types'
import { describe, expect, it } from 'vitest'

describe('isStockActive', () => {
  it('is true when isActive is true, even with target 0', () => {
    expect(isStockActive({ isActive: true, targetQuantity: 0 })).toBe(true)
  })

  it('is false when isActive is false, even with a target', () => {
    expect(isStockActive({ isActive: false, targetQuantity: 5 })).toBe(false)
  })

  it('falls back to the old rule when isActive is missing: target 0 is inactive', () => {
    expect(isStockActive({ targetQuantity: 0 })).toBe(false)
  })

  it('falls back to the old rule when isActive is missing: a target is active', () => {
    expect(isStockActive({ targetQuantity: 5 })).toBe(true)
  })

  it('treats null like missing: target 0 is inactive', () => {
    expect(isStockActive({ isActive: null, targetQuantity: 0 })).toBe(false)
  })
})
