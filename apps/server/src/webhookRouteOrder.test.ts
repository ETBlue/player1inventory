/**
 * Source-text guard for the Clerk webhook route in `index.ts` (households plan,
 * task 2.3).
 *
 * The webhook's signature covers the exact bytes Clerk sent. The route must be
 * mounted with `express.raw` ABOVE the app-wide JSON parser. If it is mounted
 * below, the JSON parser turns the body into an object first, and the check
 * runs on `JSON.stringify(body)` instead of the bytes that were signed.
 *
 * `index.ts` cannot be imported in a test: it starts Apollo and listens on a
 * port when it loads. So this test reads the file as text. Like
 * `resolvers/purge-coverage.test.ts`, it checks the source, not behaviour.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX = readFileSync(resolve(HERE, 'index.ts'), 'utf8')

// The two code lines this test compares. Comments in `index.ts` must not
// contain these exact strings, or the count checks below fail.
const WEBHOOK_ROUTE =
  "app.post('/webhooks/clerk', express.raw({ type: 'application/json' }), clerkWebhookHandler)"
const JSON_PARSER = 'app.use(express.json('

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe('index.ts mounts the Clerk webhook route', () => {
  it('exactly once, with express.raw', () => {
    expect(countOf(INDEX, WEBHOOK_ROUTE)).toBe(1)
  })

  it('above the app-wide JSON parser, so the signature is checked on the raw body', () => {
    // There must be exactly one JSON parser, or "above it" means nothing.
    expect(countOf(INDEX, JSON_PARSER)).toBe(1)
    // `indexOf` returns -1 for a missing route, and -1 is "less than" any
    // position. Without this line, a deleted route would pass the order check.
    const route = INDEX.indexOf(WEBHOOK_ROUTE)
    expect(route).toBeGreaterThanOrEqual(0)
    expect(route).toBeLessThan(INDEX.indexOf(JSON_PARSER))
  })
})
