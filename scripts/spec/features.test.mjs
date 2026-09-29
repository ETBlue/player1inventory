// Run with: pnpm test:spec
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
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
      ],
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

  it('marks a failed test with ❌ and counts it', () => {
    assert.match(
      html,
      /aria-label="failed">❌<\/span><span>user can cook a broken recipe/,
    )
    assert.match(html, /❌ 1 failed/)
    assert.match(html, /✅ 2 passed/)
  })

  it('never prints an absolute path or a failure message', () => {
    assert.doesNotMatch(html, /\/Users\//)
    assert.doesNotMatch(html, /cooking\.tsx:12/)
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
