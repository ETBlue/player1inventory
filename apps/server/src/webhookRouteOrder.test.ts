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
 * no signature check. `GET /e2e/users/:id` (task 2.7) reads one back, email
 * included. They are safe only while they are mounted inside the
 * top-level `if (E2E_TEST_MODE) { … }` block. Mounted outside it, anyone could
 * create users or mark them deleted on the production server. Since task 2.6
 * the same holds for `DELETE /e2e/cleanup`, which deletes a user's data and
 * their `User` row.
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

type RouteMount = {
  receiver: string
  method: string
  path: string
  handler: string
  insideE2eBlock: boolean
}

/**
 * Every `<receiver>.<method>('<path>', …)` call in `index.ts`, at any depth,
 * with whether it sits inside the `then` branch of the one
 * `if (E2E_TEST_MODE)` block.
 *
 * - Any receiver counts, not only `app`. A route mounted on a router
 *   (`r.post('/e2e/x')`) is found too.
 * - The path may be a plain string or a template with no `${…}` in it
 *   (`` app.post(`/e2e/x`) ``).
 * - The first argument may also be an array of paths
 *   (`app.post(['/e2e/a', '/e2e/b'], …)`). Express mounts the route on each
 *   one, so each string in the array gives one entry.
 * - `path` is LOWERCASED. Express matches paths without regard to case by
 *   default, so `app.post('/E2E/wipe')` answers `POST /e2e/wipe`.
 *
 * Calls that are not routes are collected too (`process.on('beforeExit')`).
 * That is harmless: every check below filters by path first.
 */
function routeMounts(): RouteMount[] {
  const [block] = e2eBlocks()
  const body = block?.thenStatement
  const mounts: RouteMount[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const [first, ...rest] = node.arguments
      const paths =
        first && ts.isStringLiteralLike(first)
          ? [first.text]
          : first && ts.isArrayLiteralExpression(first)
            ? first.elements.filter(ts.isStringLiteralLike).map((el) => el.text)
            : []
      for (const path of paths) {
        mounts.push({
          receiver: node.expression.expression.getText(SOURCE),
          method: node.expression.name.text,
          path: path.toLowerCase(),
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
    ['delete', '/e2e/cleanup', 'e2eCleanupHandler'],
    ['post', '/e2e/users', 'e2eCreateUserHandler'],
    ['post', '/e2e/users/:id/deleted', 'e2eUserDeletedHandler'],
    ['get', '/e2e/users/:id', 'e2eReadUserHandler'],
  ])('mounts %s %s once, inside the block', (method, path, handler) => {
    const found = routeMounts().filter((m) => m.path === path)
    expect(found).toEqual([{ receiver: 'app', method, path, handler, insideE2eBlock: true }])
  })

  it('mounts every /e2e route inside the block', () => {
    // `/e2e` itself counts too: `app.use('/e2e', router)` mounts every route
    // of that router under it.
    const e2eRoutes = routeMounts().filter(
      (m) => m.path === '/e2e' || m.path.startsWith('/e2e/'),
    )
    // The cleanup route and the three user routes. A route added later is
    // checked too.
    expect(e2eRoutes.length).toBeGreaterThanOrEqual(4)
    expect(e2eRoutes.filter((m) => !m.insideE2eBlock)).toEqual([])
  })

  it('has no string starting with /e2e outside the block, in any letter case', () => {
    // A second net under the route check above. That check knows the shapes
    // `app.<method>('<path>', …)` and `app.<method>(['<path>', …], …)`. This
    // one does not look at the call. It looks at the text: any string whose
    // lowercase text starts with `/e2e`, anywhere outside the block, fails.
    // It reads three kinds of string: '…' and "…", a template with no
    // substitution (`/e2e/x`), and the first part of a template WITH a
    // substitution (the `/e2e/` in `/e2e/${name}`). Imports are skipped,
    // because a module path is not a route.
    //
    // It still misses a path that does not start inside one string:
    //   - a path held in a variable, or imported from another file
    //     (`app.post(E2E_PATH, …)`)
    //   - a path joined from parts (`'/e' + '2e/x'`, `${prefix}/x`)
    //   - a path built at run time (from an env var, a config file, …)
    // The route check above sees none of these either.
    const [block] = e2eBlocks()
    const body = block?.thenStatement
    const outside: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) return
      if (
        (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) &&
        node.text.toLowerCase().startsWith('/e2e') &&
        !(body && node.getStart(SOURCE) >= body.getStart(SOURCE) && node.end <= body.end)
      ) {
        outside.push(node.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(SOURCE)
    expect(outside).toEqual([])
  })

  it('uses no express Router', () => {
    // A router's routes can be mounted under any path, for example
    // `app.use('/', r)` with `r.post('/e2e/x')`, or with a path built at run
    // time. The checks above cannot follow that. So `index.ts` must mount
    // every route on `app` directly, and the name `Router` must not appear.
    const routers: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === 'Router') {
        routers.push(node.parent.getText(SOURCE))
      }
      ts.forEachChild(node, visit)
    }
    visit(SOURCE)
    expect(routers).toEqual([])
  })

  it('names the four E2E handlers nowhere outside the block, except in the import', () => {
    const handlers = [
      'e2eCleanupHandler',
      'e2eCreateUserHandler',
      'e2eUserDeletedHandler',
      'e2eReadUserHandler',
    ]
    const [block] = e2eBlocks()
    const body = block?.thenStatement
    const outside: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) return
      if (
        ts.isIdentifier(node) &&
        handlers.includes(node.text) &&
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
