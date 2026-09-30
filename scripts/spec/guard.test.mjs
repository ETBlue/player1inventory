// Run with: pnpm test:spec
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { gzipSync } from 'node:zlib'
import { scanBytes } from './guard.mjs'
import { makeZip, reportHtml } from './test-zip.mjs'

describe('scanBytes', () => {
  it('finds a secret in plain text', () => {
    assert.deepEqual(scanBytes(Buffer.from('x sk_live_1'), 'a/b.js'), [
      'sk_live in a/b.js',
    ])
  })

  it('unzips a .gz file before it scans', () => {
    assert.deepEqual(scanBytes(gzipSync('DATABASE_URL=x'), 'm.json.gz'), [
      'DATABASE_URL in m.json.gz',
    ])
  })

  it('scans every entry of the zip inside a Playwright index.html', () => {
    const zip = makeZip({
      'report.json': '{}',
      'stored.json': { data: 'a sk_test_x b', method: 0, localExtra: 2 },
      'deflated.json': { data: 'postgres://u@h/db', comment: 3 },
    })
    assert.deepEqual(scanBytes(Buffer.from(reportHtml(zip)), 'r/index.html'), [
      'sk_test in r/index.html → stored.json',
      'postgres:// in r/index.html → deflated.json',
    ])
  })

  it('scans every entry of a .zip file', () => {
    const zip = makeZip({ 'trace.network': 'BEGIN PRIVATE KEY' })
    assert.deepEqual(scanBytes(zip, 'data/trace.zip'), [
      'BEGIN PRIVATE KEY in data/trace.zip → trace.network',
    ])
  })

  it('skips images, as files and as zip entries', () => {
    assert.deepEqual(scanBytes(Buffer.from('sk_test'), 'data/a.PNG'), [])
    const zip = makeZip({ 'shot.jpeg': 'sk_test' })
    assert.deepEqual(scanBytes(zip, 'x.zip'), [])
  })

  it('throws when the embedded zip cannot be read', () => {
    const html = reportHtml(Buffer.from('not a zip'))
    assert.throws(() => scanBytes(Buffer.from(html), 'r/index.html'))
  })

  it('throws when the tag is there but its content is not base64 data', () => {
    const html =
      '<script id="playwrightReportBase64" type="application/zip">???</script>'
    assert.throws(() => scanBytes(Buffer.from(html), 'r/index.html'))
  })
})
