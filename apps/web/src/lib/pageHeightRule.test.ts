// One height rule for every page (docs/global/bugs/2026-11-24-bug-page-height-vh.md).
//
// Only `Layout` is sized to the viewport (`h-dvh`). Its `<main>` is a size
// container, so a page sizes itself with `h-[100cqh]` or `min-h-[100cqh]`.
// A viewport unit on a page (`h-screen`, `min-h-screen`, `100vh`, …) is not the
// height of `main`: on iOS in home-screen mode `100vh` can be taller than
// `100dvh`, and with the mobile bottom bar `main` is shorter than the viewport.
// Both give extra empty space at the bottom of the page.
//
// jsdom computes no layout, so this test reads the source text instead. It
// walks `apps/web/src` with `node:fs` and skips test and story files (stories
// may wrap a component in a viewport-sized frame, since they have no Layout).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

// The one element allowed to use a viewport unit, and the class it uses.
const ALLOWED: Record<string, string[]> = {
  'components/global/Layout/Layout.tsx': ['h-dvh'],
}

// A Tailwind height class with a viewport unit:
// `h-screen`, `min-h-svh`, `max-h-dvh`, `h-[100vh]`, `min-h-[50lvh]`, …
const VIEWPORT_HEIGHT =
  /(?<![\w-])(?:min-|max-)?h-(?:screen|[sld]?vh|\[[^\]]*?\d(?:[sld]?vh)\b[^\]]*\])/g

function sourceFiles(): string[] {
  const entries = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  return entries
    .map((entry) => entry.split(sep).join('/'))
    .filter((path) => /\.(ts|tsx)$/.test(path))
    .filter((path) => !/\.(test|stories)\.(ts|tsx)$/.test(path))
    .filter((path) => !path.startsWith('generated/'))
    .filter((path) => path !== 'routeTree.gen.ts')
}

function findViewportHeights(path: string, text: string): string[] {
  const allowed = ALLOWED[path] ?? []
  const found: string[] = []
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(VIEWPORT_HEIGHT)) {
      if (!allowed.includes(match[0])) {
        found.push(`${path}:${index + 1} ${match[0]}`)
      }
    }
  })
  return found
}

describe('page height rule', () => {
  it('reads the source files', () => {
    // A broken walk would find nothing and pass the test below.
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(300)
    expect(files).toContain('components/global/Layout/Layout.tsx')
  })

  it('finds every form of a viewport height class', () => {
    const line = [
      'h-screen',
      'min-h-screen',
      'max-h-screen',
      'h-dvh',
      'min-h-svh',
      'h-lvh',
      'h-[100vh]',
      'min-h-[50vh]',
      'max-h-[80dvh]',
      'h-[calc(100vh-4rem)]',
    ].join(' ')
    expect(findViewportHeights('x.tsx', line)).toHaveLength(10)
    expect(
      findViewportHeights('x.tsx', 'h-[100cqh] min-h-[100cqh] h-full w-screen'),
    ).toEqual([])
  })

  it('no page uses a viewport height; only Layout does', () => {
    const found = sourceFiles().flatMap((path) =>
      findViewportHeights(
        path,
        readFileSync(join(SRC, path.split('/').join(sep)), 'utf8'),
      ),
    )
    // Use h-[100cqh] or min-h-[100cqh] instead. See the header comment.
    expect(found).toEqual([])
  })

  it('Layout still uses h-dvh', () => {
    const text = readFileSync(
      join(SRC, 'components', 'global', 'Layout', 'Layout.tsx'),
      'utf8',
    )
    expect(text).toContain('h-dvh')
  })
})
