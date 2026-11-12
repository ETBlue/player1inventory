/**
 * Source-text guard for the GraphQL context in `index.ts` (households plan,
 * task 2.4; moved in H3a task 3.5).
 *
 * The two branches of the context (E2E test header, Clerk session) moved to
 * `lib/graphqlContext.ts` in H3a task 3.5. `lib/graphqlContext.test.ts` now
 * checks, by running the function, that BOTH branches call `ensureUser` and
 * read `x-app-language`.
 *
 * What is left here is what only `index.ts` decides:
 * - it passes `ensureUserOrLog`, not `ensureUser`. Only the first one never
 *   throws, and a throw there would fail every GraphQL request (plan P11).
 * - in E2E mode it does not ask Clerk.
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
const ENSURE_USER_DEP = 'ensureUser: (userId) => ensureUserOrLog(userId, USER_SOURCE)'
const CONTEXT = 'context: createGraphQLContext({'
const E2E_SOURCE = "const USER_SOURCE: UserSource = E2E_TEST_MODE\n  ? { kind: 'e2e' }"

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe('the GraphQL context in index.ts', () => {
  it('builds the context with createGraphQLContext', () => {
    expect(countOf(INDEX, CONTEXT)).toBe(1)
  })

  it('passes ensureUserOrLog as the ensureUser step', () => {
    expect(countOf(INDEX, ENSURE_USER_DEP)).toBe(1)
  })

  it('never calls ensureUser directly, because it can throw', () => {
    expect(INDEX).not.toMatch(/\bensureUser\(/)
  })

  it('uses the E2E source, which never asks Clerk, in E2E mode', () => {
    expect(countOf(INDEX, E2E_SOURCE)).toBe(1)
  })
})
