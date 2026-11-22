// Run with: pnpm test:spec
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { collectTests, formatSummary, main, summarize } from './e2e-times.mjs'

// The shape of Playwright 1.58's JSON reporter, cut down to the keys the
// script reads. A test inside two nested `describe` blocks, and one at the
// top of its file.
const NESTED = {
  stats: { duration: 12500, expected: 2, unexpected: 0, skipped: 0, flaky: 0 },
  suites: [
    {
      title: 'a.spec.ts',
      file: 'a.spec.ts',
      specs: [
        {
          title: 'user can do a',
          file: 'a.spec.ts',
          tests: [{ projectName: 'cloud', results: [{ duration: 1000 }] }],
        },
      ],
      suites: [
        {
          title: 'outer',
          file: 'a.spec.ts',
          specs: [],
          suites: [
            {
              title: 'inner',
              file: 'a.spec.ts',
              specs: [
                {
                  title: 'user can do b',
                  file: 'a.spec.ts',
                  tests: [
                    { projectName: 'cloud', results: [{ duration: 9000 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

// A test that failed once and passed on its retry: two `results[]` entries.
const RETRIED = {
  stats: { duration: 7000, expected: 1, unexpected: 0, skipped: 0, flaky: 1 },
  suites: [
    {
      title: 'b.spec.ts',
      file: 'b.spec.ts',
      specs: [
        {
          title: 'user can retry',
          file: 'b.spec.ts',
          tests: [
            {
              projectName: 'local',
              results: [
                { duration: 4000, status: 'failed', retry: 0 },
                { duration: 2500, status: 'passed', retry: 1 },
              ],
            },
          ],
        },
        {
          title: 'user can pass',
          file: 'b.spec.ts',
          tests: [{ projectName: 'local', results: [{ duration: 500 }] }],
        },
      ],
    },
  ],
}

describe('collectTests', () => {
  it('finds a test inside nested describe blocks, with the describe titles', () => {
    const tests = collectTests(NESTED)
    assert.deepEqual(
      tests.map((t) => [t.title, t.ms]),
      [
        ['user can do a', 1000],
        ['outer › inner › user can do b', 9000],
      ],
    )
  })

  it('counts every attempt of a retried test', () => {
    const retried = collectTests(RETRIED).find(
      (t) => t.title === 'user can retry',
    )
    assert.equal(retried?.ms, 6500)
  })
})

describe('summarize', () => {
  it('gives the total, the slowest tests first and the time per file', () => {
    const [s] = summarize(NESTED)
    assert.equal(s.project, 'cloud')
    assert.equal(s.totalMs, 12500)
    assert.equal(s.testCount, 2)
    assert.deepEqual(
      s.slowestTests.map((t) => t.ms),
      [9000, 1000],
    )
    assert.deepEqual(s.files, [{ file: 'a.spec.ts', ms: 10000 }])
  })

  it('sorts the spec files by time, largest first, retries included', () => {
    // RETRIED's file, moved into the same project as NESTED.
    const moved = JSON.parse(
      JSON.stringify(RETRIED.suites[0]).replaceAll('"local"', '"cloud"'),
    )
    const report = { stats: { duration: 1 }, suites: [moved, ...NESTED.suites] }
    const [s] = summarize(report)
    assert.deepEqual(s.files, [
      { file: 'a.spec.ts', ms: 10000 },
      { file: 'b.spec.ts', ms: 7000 },
    ])
  })

  it('keeps only the slowest N tests', () => {
    const [s] = summarize(NESTED, 1)
    assert.deepEqual(
      s.slowestTests.map((t) => t.title),
      ['outer › inner › user can do b'],
    )
  })
})

describe('formatSummary', () => {
  it('prints the total in minutes and seconds, and one line per test', () => {
    const text = formatSummary(summarize(NESTED)[0])
    assert.match(text, /== cloud: total 0m13s \(12\.5 s\), 2 tests/)
    assert.match(text, /9\.0 {2}a\.spec\.ts {2}outer › inner › user can do b/)
    assert.match(text, /10\.0 {2}a\.spec\.ts$/m)
  })
})

describe('main', () => {
  it('prints each report, and warns about a missing or broken file without throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-times-'))
    try {
      writeFileSync(join(dir, 'local.json'), JSON.stringify(RETRIED))
      writeFileSync(join(dir, 'broken.json'), '{ not json')
      const logs = []
      const warnings = []
      main(
        [
          join(dir, 'local.json'),
          join(dir, 'broken.json'),
          join(dir, 'missing.json'),
        ],
        (line) => logs.push(line),
        (line) => warnings.push(line),
      )
      assert.equal(logs.length, 1)
      assert.match(logs[0], /== local: total 0m07s/)
      assert.equal(warnings.length, 2)
      assert.match(warnings[0], /cannot read .*broken\.json \(SyntaxError\)/)
      assert.match(warnings[1], /cannot read .*missing\.json \(ENOENT\)/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns when no file is given', () => {
    const warnings = []
    main([], () => {}, (line) => warnings.push(line))
    assert.deepEqual(warnings, ['e2e-times: no JSON report given'])
  })
})
