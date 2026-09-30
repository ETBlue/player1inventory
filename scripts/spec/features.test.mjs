// Run with: pnpm test:spec
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  countFilesNotRun,
  relativePath,
  renderFeaturePage,
  sectionFor,
  selectFeatureTests,
} from './features.mjs'

const ROOT = '/Users/someone/Code/player1inventory/apps/web/src'

// A hand-made Vitest JSON report with one case for each rule of the page.
const REPORT = {
  startTime: Date.UTC(2026, 8, 29, 3, 0),
  testResults: [
    {
      name: `${ROOT}/routes/cooking.test.tsx`,
      assertionResults: [
        {
          // Inside a `describe`: `fullName` starts with "Cooking page", not "user".
          ancestorTitles: ['Cooking page'],
          fullName: 'Cooking page user can check a recipe',
          title: 'user can check a recipe',
          status: 'passed',
        },
        {
          ancestorTitles: ['Cooking page'],
          fullName: 'Cooking page renders the list',
          title: 'renders the list',
          status: 'passed',
        },
        {
          ancestorTitles: [],
          fullName: 'user sees <script>alert(1)</script> as text',
          title: 'user sees <script>alert(1)</script> as text',
          status: 'passed',
        },
        {
          ancestorTitles: [],
          fullName: 'user can cook a broken recipe',
          title: 'user can cook a broken recipe',
          status: 'failed',
          failureMessages: [`Error at ${ROOT}/routes/cooking.tsx:12`],
        },
        {
          ancestorTitles: [],
          fullName: 'users are counted',
          title: 'users are counted',
          status: 'passed',
        },
        {
          // Capital U: the rule is case-sensitive, so this one is dropped.
          ancestorTitles: [],
          fullName: 'User can shout',
          title: 'User can shout',
          status: 'passed',
        },
        {
          ancestorTitles: ['Cooking <b>bold</b> group'],
          fullName: 'Cooking <b>bold</b> group user can skip a recipe',
          title: 'user can skip a recipe',
          status: 'skipped',
        },
      ],
    },
    // The files below are in reverse of the page order, so the page must sort
    // them: pages (Cooking), then components, then the rest (Hooks).
    {
      name: `${ROOT}/hooks/useItems.test.ts`,
      status: 'passed',
      assertionResults: [
        {
          ancestorTitles: [],
          fullName: 'user can load items',
          title: 'user can load items',
          status: 'passed',
        },
      ],
    },
    {
      name: `${ROOT}/components/item/ItemCard/ItemCard.test.tsx`,
      status: 'passed',
      assertionResults: [
        {
          ancestorTitles: [],
          fullName: 'user can open an item',
          title: 'user can open an item',
          status: 'passed',
        },
      ],
    },
    // A file that fails to load (import or syntax error): Vitest reports the
    // file as failed, with no tests and an error message that holds paths.
    {
      name: `${ROOT}/routes/settings/tags.test.tsx`,
      status: 'failed',
      message: `Failed to load ${ROOT}/routes/settings/tags.tsx: SyntaxError`,
      assertionResults: [],
    },
  ],
}

describe('renderFeaturePage', () => {
  const html = renderFeaturePage(REPORT)

  it('keeps a user test that sits inside a describe block', () => {
    assert.match(html, /user can check a recipe/)
    assert.match(html, /<h3>Cooking page<\/h3>/)
  })

  it('drops tests whose own title does not start with "user "', () => {
    assert.doesNotMatch(html, /renders the list/)
    assert.doesNotMatch(html, /users are counted/)
  })

  it('escapes test text', () => {
    assert.doesNotMatch(html, /<script>/)
    assert.match(
      html,
      /user sees &lt;script&gt;alert\(1\)&lt;\/script&gt; as text/,
    )
  })

  it('drops a title that starts with a capital "User"', () => {
    assert.doesNotMatch(html, /User can shout/)
  })

  it('marks a failed test with ❌ and counts it', () => {
    assert.match(
      html,
      /aria-label="failed">❌<\/span><span>user can cook a broken recipe/,
    )
    assert.match(html, /❌ 1 failed/)
    assert.match(html, /✅ 4 passed/)
  })

  it('marks a skipped test with ⏭ and counts it as skipped, not passed', () => {
    assert.match(
      html,
      /aria-label="skipped">⏭<\/span><span>user can skip a recipe/,
    )
    assert.match(html, /⏭ 1 skipped/)
  })

  it('escapes a describe title in the group heading', () => {
    assert.match(html, /<h3>Cooking &lt;b&gt;bold&lt;\/b&gt; group<\/h3>/)
    assert.doesNotMatch(html, /<b>/)
  })

  it('orders sections: pages, then components, then the rest', () => {
    const pages = html.indexOf('>Cooking</h2>')
    const components = html.indexOf('>Components · Item</h2>')
    const rest = html.indexOf('>Hooks</h2>')
    assert.ok(pages > 0 && components > 0 && rest > 0)
    assert.ok(pages < components, 'Cooking before Components · Item')
    assert.ok(components < rest, 'Components · Item before Hooks')
  })

  it('counts a test file that failed to run, without its message', () => {
    assert.match(html, /1 test file failed to run/)
    assert.doesNotMatch(html, /Failed to load/)
    assert.doesNotMatch(html, /SyntaxError/)
  })

  // The page prints only one path segment per file: the section name. So a
  // leak of the absolute path would show up as a wrong section name. This test
  // checks both: the right name is there, and no part of the path is.
  it('names the section from the path and never prints the absolute path', () => {
    assert.match(html, /<h2 id="s\d+">Cooking<\/h2>/)
    assert.doesNotMatch(html, /someone/)
    assert.doesNotMatch(html, /\/Users\//)
    assert.doesNotMatch(html, /cooking\.tsx:12/)
  })
})

describe('countFilesNotRun', () => {
  it('counts failed files with no failed test, and nothing else', () => {
    const json = {
      testResults: [
        // Fails to load: no tests at all.
        { status: 'failed', assertionResults: [] },
        // A hook failed: the file failed, but no single test did.
        {
          status: 'failed',
          assertionResults: [{ title: 'user can x', status: 'skipped' }],
        },
        // A normal failure: counted as a failed test, not here.
        {
          status: 'failed',
          assertionResults: [{ title: 'user can y', status: 'failed' }],
        },
        { status: 'passed', assertionResults: [] },
      ],
    }
    assert.equal(countFilesNotRun(json), 2)
    assert.equal(countFilesNotRun({}), 0)
  })

  it('says "files" when there is more than one', () => {
    const json = {
      testResults: [
        { status: 'failed', assertionResults: [] },
        { status: 'failed' },
      ],
    }
    assert.match(renderFeaturePage(json), /2 test files failed to run/)
  })
})

describe('sectionFor', () => {
  const cases = [
    ['routes/index.test.tsx', 'Pantry'],
    ['routes/cooking.cloud.test.tsx', 'Cooking'],
    ['routes/items/$id/relation/tags.test.tsx', 'Items'],
    ['routes/settings/index.test.tsx', 'Settings'],
    ['routes/settings/tags.test.tsx', 'Settings · Tags'],
    ['routes/settings/tags/$id/items.test.tsx', 'Settings · Tags'],
    ['routes/__root.offline.test.tsx', 'App'],
    ['components/item/ItemCard/ItemCard.test.tsx', 'Components · Item'],
    ['hooks/useItems.test.ts', 'Hooks'],
    ['db/operations.test.ts', 'Database'],
    ['lib/importData.test.ts', 'Library'],
    ['bootstrap.test.ts', 'App'],
    // A folder named like an `Object` method must not read from the prototype.
    ['toString/x.test.ts', 'To string'],
  ]
  for (const [path, name] of cases) {
    it(`${path} → ${name}`, () => assert.equal(sectionFor(path).name, name))
  }
})

describe('relativePath', () => {
  it('cuts the path at apps/web/src', () => {
    assert.equal(
      relativePath(`${ROOT}/hooks/useItems.test.ts`),
      'hooks/useItems.test.ts',
    )
  })
  it('keeps only the file name for an unknown layout', () => {
    assert.equal(relativePath('/Users/someone/other/x.test.ts'), 'x.test.ts')
  })
})

describe('selectFeatureTests', () => {
  it('accepts an empty report', () => {
    assert.deepEqual(selectFeatureTests({}), [])
    assert.match(renderFeaturePage({}), /No tests found/)
  })
})
