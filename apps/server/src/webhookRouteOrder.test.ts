/**
 * Source-text guards for routes in `index.ts` (households plan, tasks 2.3 and
 * 2.5).
 *
 * ── Task 2.3: the Clerk webhook route ──
 *
 * The webhook's signature covers the exact bytes Clerk sent. The route must be
 * mounted with `express.raw` ABOVE the app-wide JSON parser. If it is mounted
 * below, the JSON parser turns the body into an object first, and the check
 * runs on `JSON.stringify(body)` instead of the bytes that were signed.
 *
 * `index.ts` cannot be imported in a test: it starts Apollo and listens on a
 * port when it loads. So this test reads the file as text. Like
 * `resolvers/purge-coverage.test.ts`, it checks the source, not behaviour.
 *
 * ── Task 2.5: the E2E-only routes ──
 *
 * `POST /e2e/users` and `POST /e2e/users/:id/deleted` write `User` rows with
 * no signature check. They are safe only while they are mounted inside the
 * top-level `if (E2E_TEST_MODE) { … }` block. Mounted outside it, anyone could
 * create users or mark them deleted on the production server.
 *
 * "Inside" is checked on the parsed syntax tree, with the TypeScript parser,
 * not by comparing text positions. A route placed after the block's closing
 * brace is outside it, and a position check against the `if` line alone would
 * not see that.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
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

// ── Task 2.5 ──

const SOURCE = ts.createSourceFile('index.ts', INDEX, ts.ScriptTarget.Latest, true)

/** The top-level `if (E2E_TEST_MODE) { … }` statements in `index.ts`. */
function e2eBlocks(): ts.IfStatement[] {
  return SOURCE.statements
    .filter(ts.isIfStatement)
    .filter((stmt) => stmt.expression.getText(SOURCE) === 'E2E_TEST_MODE')
}

type RouteMount = { method: string; path: string; handler: string; insideE2eBlock: boolean }

/**
 * Every `app.<method>('<path>', …)` call in `index.ts`, at any depth, with
 * whether it sits inside the `then` branch of the one `if (E2E_TEST_MODE)`
 * block.
 */
function routeMounts(): RouteMount[] {
  const [block] = e2eBlocks()
  const body = block?.thenStatement
  const mounts: RouteMount[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(SOURCE) === 'app'
    ) {
      const [first, ...rest] = node.arguments
      if (first && ts.isStringLiteral(first)) {
        mounts.push({
          method: node.expression.name.text,
          path: first.text,
          handler: rest.map((arg) => arg.getText(SOURCE)).join(', '),
          insideE2eBlock:
            body !== undefined && node.getStart(SOURCE) >= body.getStart(SOURCE) && node.end <= body.end,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(SOURCE)
  return mounts
}

describe('index.ts mounts the E2E-only routes', () => {
  it('has exactly one top-level if (E2E_TEST_MODE) block, with no else branch', () => {
    const blocks = e2eBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.elseStatement).toBeUndefined()
    expect(blocks[0] && ts.isBlock(blocks[0].thenStatement)).toBe(true)
  })

  it.each([
    ['post', '/e2e/users', 'e2eCreateUserHandler'],
    ['post', '/e2e/users/:id/deleted', 'e2eUserDeletedHandler'],
  ])('mounts %s %s once, inside the block', (method, path, handler) => {
    const found = routeMounts().filter((m) => m.path === path)
    expect(found).toEqual([{ method, path, handler, insideE2eBlock: true }])
  })

  it('mounts every /e2e/ route inside the block', () => {
    const e2eRoutes = routeMounts().filter((m) => m.path.startsWith('/e2e/'))
    // The cleanup route and the two user routes. A route added later is
    // checked too.
    expect(e2eRoutes.length).toBeGreaterThanOrEqual(3)
    expect(e2eRoutes.filter((m) => !m.insideE2eBlock)).toEqual([])
  })

  it('names the two user handlers nowhere outside the block, except in the import', () => {
    const [block] = e2eBlocks()
    const body = block?.thenStatement
    const outside: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) return
      if (
        ts.isIdentifier(node) &&
        (node.text === 'e2eCreateUserHandler' || node.text === 'e2eUserDeletedHandler') &&
        !(body && node.getStart(SOURCE) >= body.getStart(SOURCE) && node.end <= body.end)
      ) {
        outside.push(node.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(SOURCE)
    expect(outside).toEqual([])
  })
})
