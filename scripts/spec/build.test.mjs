// Run with: pnpm test:spec
//
// End-to-end tests of build.mjs. Each test makes a fake repo root in a temp
// folder, with report files like the real ones, and runs the build there
// through SPEC_ROOT.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { makeZip, reportHtml } from './test-zip.mjs'

const BUILD = join(dirname(fileURLToPath(import.meta.url)), 'build.mjs')

let root

function write(path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

function build() {
  const result = spawnSync(process.execPath, [BUILD], {
    env: { ...process.env, SPEC_ROOT: root },
    encoding: 'utf8',
  })
  return {
    code: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  }
}

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

const REPORT_JSON = JSON.stringify({
  startTime: 1790000000000,
  stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0 },
})

// A Playwright report like the real one: `index.html` with the embedded zip
// (report.json plus one JSON file per spec file), and a screenshot in data/.
function playwrightReport(project, specJson) {
  const zip = makeZip({
    'report.json': REPORT_JSON,
    '4f1b2c3d.json': { data: specJson, localExtra: 4 },
  })
  write(`playwright-report/${project}/index.html`, reportHtml(zip))
  // A screenshot: an image is skipped, so this fake secret must not match.
  write(`playwright-report/${project}/data/abc.png`, 'sk_test_in_an_image')
}

const CLEAN_SPEC = JSON.stringify({
  fileName: 'shopping.spec.ts',
  tests: [{ title: 'user can add an item to the cart' }],
})

const VITEST_JSON = {
  startTime: 1790000000000,
  testResults: [
    {
      name: '/Users/someone/p1i/apps/web/src/routes/cooking.test.tsx',
      status: 'passed',
      assertionResults: [
        { ancestorTitles: [], title: 'user can cook', status: 'passed' },
      ],
    },
  ],
}

function vitestReport(json = VITEST_JSON, meta = '{"config":{"env":{}}}') {
  write('apps/web/spec-report/vitest.json', JSON.stringify(json))
  write('apps/web/spec-report/html/index.html', '<html></html>')
  write('apps/web/spec-report/html/html.meta.json.gz', gzipSync(meta))
}

// Output folders from an earlier build. A stopped build must leave them as they were.
function oldOutput() {
  write('spec-dist/old.txt', 'old')
  write('spec-dist-dev/old.txt', 'old')
}

function assertOldOutputKept() {
  assert.equal(read('spec-dist/old.txt'), 'old')
  assert.equal(read('spec-dist-dev/old.txt'), 'old')
  assert.ok(!existsSync(join(root, 'spec-dist/index.html')))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spec-build-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('build.mjs', () => {
  it('builds both sites from clean reports', () => {
    playwrightReport('local', CLEAN_SPEC)
    vitestReport()
    oldOutput()
    const { code, output } = build()
    assert.equal(code, 0, output)
    assert.ok(existsSync(join(root, 'spec-dist/local/index.html')))
    assert.ok(existsSync(join(root, 'spec-dist/features/index.html')))
    assert.ok(existsSync(join(root, 'spec-dist-dev/index.html')))
    assert.ok(!existsSync(join(root, 'spec-dist/old.txt')))
    const landing = read('spec-dist/index.html')
    assert.match(landing, /✅ 3 passed/)
    assert.match(landing, /✅ 1 passed/)
  })

  it('stops when a Playwright report zip holds a secret, and writes nothing', () => {
    playwrightReport(
      'cloud',
      JSON.stringify({
        fileName: 'login.spec.ts',
        // A source snippet of a failed test, as Playwright shows it.
        snippet: "const key = 'sk_test_x'",
      }),
    )
    vitestReport()
    oldOutput()
    const { code, output } = build()
    assert.equal(code, 1, output)
    assert.match(
      output,
      /sk_test in playwright-report\/cloud\/index\.html → 4f1b2c3d\.json/,
    )
    assert.match(output, /test title or a comment/)
    assert.doesNotMatch(output, /abc\.png/)
    assertOldOutputKept()
  })

  it('stops when the developer report holds a secret, and writes nothing', () => {
    playwrightReport('local', CLEAN_SPEC)
    vitestReport(VITEST_JSON, '{"config":{"env":{"X":"postgres://u:p@h/db"}}}')
    oldOutput()
    const { code, output } = build()
    assert.equal(code, 1, output)
    assert.match(
      output,
      /postgres:\/\/ in apps\/web\/spec-report\/html\/html\.meta\.json\.gz/,
    )
    assertOldOutputKept()
  })

  it('stops when the feature page would show a secret, and writes nothing', () => {
    vitestReport({
      testResults: [
        {
          name: '/x/apps/web/src/routes/cooking.test.tsx',
          status: 'passed',
          assertionResults: [
            {
              ancestorTitles: [],
              title: 'user sees sk_live_x as text',
              status: 'passed',
            },
          ],
        },
      ],
    })
    // Remove the developer report, so only the feature page can match.
    rmSync(join(root, 'apps/web/spec-report/html'), { recursive: true })
    oldOutput()
    const { code, output } = build()
    assert.equal(code, 1, output)
    assert.match(output, /sk_live in spec-dist\/features\/index\.html/)
    assertOldOutputKept()
  })

  it('does not publish a Playwright report whose zip cannot be read', () => {
    write(
      'playwright-report/pwa/index.html',
      reportHtml(Buffer.from('not a zip, sk_test hidden')),
    )
    playwrightReport('local', CLEAN_SPEC)
    vitestReport()
    const { code, output } = build()
    assert.equal(code, 0, output)
    assert.match(output, /cannot check "pwa" for secrets/)
    assert.ok(!existsSync(join(root, 'spec-dist/pwa')))
    assert.ok(existsSync(join(root, 'spec-dist/local/index.html')))
    assert.match(
      read('spec-dist/index.html'),
      /Not published: this report could not be checked for secrets/,
    )
  })

  it('does not publish a Playwright report with no embedded zip', () => {
    write('playwright-report/pwa/index.html', '<html>new layout</html>')
    vitestReport()
    const { code, output } = build()
    assert.equal(code, 0, output)
    assert.ok(!existsSync(join(root, 'spec-dist/pwa')))
    assert.match(read('spec-dist/index.html'), /Not published/)
  })

  it('shows test files that failed to run on the Feature tests card', () => {
    vitestReport({
      testResults: [
        ...VITEST_JSON.testResults,
        {
          name: '/Users/someone/p1i/apps/web/src/routes/items.test.tsx',
          status: 'failed',
          message: 'Failed to load /Users/someone/p1i/apps/web/src/x.ts',
          assertionResults: [],
        },
      ],
    })
    const { code, output } = build()
    assert.equal(code, 0, output)
    const landing = read('spec-dist/index.html')
    assert.match(landing, /class="fail">❌ 1 test file failed to run/)
    assert.doesNotMatch(landing, /Failed to load|someone/)
    assert.match(read('spec-dist/features/index.html'), /1 test file failed/)
  })
})
