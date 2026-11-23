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
 *   Since households H3c-1 task C.3 it passes it TWICE: to the HTTP context
 *   and to the WebSocket server (`lib/wsServer.ts`). A throw in the socket's
 *   `onConnect` would close the socket with 4500, which the client does not
 *   retry.
 * - it passes the same `E2E_TEST_MODE` to both, so the socket cannot accept
 *   `connectionParams.e2eUserId` in production.
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
const WS_SERVER = 'attachWsServer(httpServer, schema, {'
const E2E_DEP = 'e2eTestMode: E2E_TEST_MODE,'
const E2E_SOURCE = "const USER_SOURCE: UserSource = E2E_TEST_MODE\n  ? { kind: 'e2e' }"

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe('the GraphQL context in index.ts', () => {
  it('builds the context with createGraphQLContext', () => {
    expect(countOf(INDEX, CONTEXT)).toBe(1)
  })

  it('opens the WebSocket endpoint with attachWsServer and the shared schema', () => {
    expect(countOf(INDEX, WS_SERVER)).toBe(1)
  })

  it('passes ensureUserOrLog as the ensureUser step, to HTTP and to the socket', () => {
    expect(countOf(INDEX, ENSURE_USER_DEP)).toBe(2)
  })

  it('passes the real E2E_TEST_MODE to HTTP and to the socket', () => {
    expect(countOf(INDEX, E2E_DEP)).toBe(2)
  })

  it('never calls ensureUser directly, because it can throw', () => {
    expect(INDEX).not.toMatch(/\bensureUser\(/)
  })

  it('uses the E2E source, which never asks Clerk, in E2E mode', () => {
    expect(countOf(INDEX, E2E_SOURCE)).toBe(1)
  })
})
