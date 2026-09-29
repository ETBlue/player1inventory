// Run with: pnpm test:spec
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readPlaywrightStats, readZipEntries } from './playwright-stats.mjs'
import { makeZip, reportHtml } from './test-zip.mjs'

const REPORT_JSON = JSON.stringify({
  startTime: 1790000000000,
  stats: {
    total: 10,
    expected: 7,
    unexpected: 1,
    flaky: 0,
    skipped: 2,
    ok: false,
  },
})

const STATS = {
  passed: 7,
  failed: 1,
  flaky: 0,
  skipped: 2,
  startTime: 1790000000000,
}

describe('readPlaywrightStats', () => {
  it('reads the totals from report.json inside the embedded zip', () => {
    const zip = makeZip({ 'abc.json': '{}', 'report.json': REPORT_JSON })
    assert.deepEqual(readPlaywrightStats(reportHtml(zip)), STATS)
  })

  // Each field here catches one way to misread the zip layout:
  // - the entry before report.json has a central extra field and a comment,
  //   so the reader must skip them to find the next central record
  // - report.json has a local extra field, so its data starts later
  // - report.json is deflated with level 0, so its compressed size is larger
  //   than its raw size, and reading the raw size cuts the data short
  it('reads a zip with extra fields, a comment and a stored entry', () => {
    const zip = makeZip({
      'stored.txt': { data: 'plain text', method: 0 },
      'abc.json': { data: '{}', centralExtra: 9, comment: 7 },
      'report.json': { data: REPORT_JSON, level: 0, localExtra: 5 },
    })
    assert.deepEqual(readPlaywrightStats(reportHtml(zip)), STATS)
  })

  it('returns null when the report has no embedded zip', () => {
    assert.equal(readPlaywrightStats('<html></html>'), null)
  })

  it('returns null when the zip is broken', () => {
    assert.equal(
      readPlaywrightStats(reportHtml(Buffer.from('not a zip'))),
      null,
    )
  })

  it('returns null when report.json has no stats', () => {
    assert.equal(
      readPlaywrightStats(reportHtml(makeZip({ 'report.json': '{}' }))),
      null,
    )
  })
})

describe('readZipEntries', () => {
  it('returns every entry, stored and deflated, with its bytes', () => {
    const zip = makeZip({
      'stored.txt': { data: 'plain text', method: 0, localExtra: 3 },
      'abc.json': { data: '{"a":1}', centralExtra: 4, comment: 2 },
      'tiny.json': { data: 'x'.repeat(50), level: 0 },
    })
    const entries = readZipEntries(zip).map(({ name, data }) => [
      name,
      data.toString('utf8'),
    ])
    assert.deepEqual(entries, [
      ['stored.txt', 'plain text'],
      ['abc.json', '{"a":1}'],
      ['tiny.json', 'x'.repeat(50)],
    ])
  })

  it('throws on bytes that are not a zip', () => {
    assert.throws(() => readZipEntries(Buffer.from('not a zip')))
  })
})
