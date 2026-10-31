/**
 * Source-text guard for the GraphQL context function in `index.ts`
 * (households plan, task 2.4).
 *
 * The context function must call `ensureUserOrLog` in BOTH branches. The E2E
 * branch returns early, so one call placed after it would never run in E2E
 * mode. It must call `ensureUserOrLog`, not `ensureUser`: only the first one
 * never throws, and a throw there would fail every GraphQL request (plan P11).
 * In E2E mode it must not ask Clerk.
 *
 * `index.ts` cannot be imported in a test: it starts Apollo and listens on a
 * port when it loads. So this test reads the file as text, like
 * `webhookRouteOrder.test.ts`. It checks the source, not behaviour.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX = readFileSync(resolve(HERE, 'index.ts'), 'utf8')

// The code lines this test looks for. Comments in `index.ts` must not contain
// these exact strings, or the count checks below fail.
const E2E_CALL = 'await ensureUserOrLog(testUserId, USER_SOURCE)'
const E2E_RETURN = 'return { userId: testUserId }'
const CLERK_CALL = 'if (userId) await ensureUserOrLog(userId, USER_SOURCE)'
const CLERK_RETURN = 'return { userId }'
const E2E_SOURCE = "const USER_SOURCE: UserSource = E2E_TEST_MODE\n  ? { kind: 'e2e' }"

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1
}

/** Assert `first` appears once, `second` appears once, and `first` comes first. */
function expectOnceAndBefore(first: string, second: string) {
  expect(countOf(INDEX, first)).toBe(1)
  expect(countOf(INDEX, second)).toBe(1)
  expect(INDEX.indexOf(first)).toBeLessThan(INDEX.indexOf(second))
}

describe('the GraphQL context in index.ts', () => {
  it('calls ensureUserOrLog in the E2E branch, before it returns early', () => {
    expectOnceAndBefore(E2E_CALL, E2E_RETURN)
  })

  it('calls ensureUserOrLog in the Clerk branch, before it returns', () => {
    expectOnceAndBefore(CLERK_CALL, CLERK_RETURN)
  })

  it('never calls ensureUser directly, because it can throw', () => {
    expect(INDEX).not.toMatch(/\bensureUser\(/)
  })

  it('uses the E2E source, which never asks Clerk, in E2E mode', () => {
    expect(countOf(INDEX, E2E_SOURCE)).toBe(1)
  })
})
