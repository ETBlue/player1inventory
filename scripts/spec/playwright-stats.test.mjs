// Run with: pnpm test:spec
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deflateRawSync } from 'node:zlib'
import { readPlaywrightStats } from './playwright-stats.mjs'

// Build a zip the same shape Playwright writes: deflated entries, a central
// directory, an end record. CRC fields are left at 0; the reader does not check them.
function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name)
    const raw = Buffer.from(text)
    const data = deflateRawSync(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

function reportHtml(zip) {
  return `<html><body><script id="playwrightReportBase64" type="application/zip">data:application/zip;base64,${zip.toString('base64')}</script></body></html>`
}

describe('readPlaywrightStats', () => {
  it('reads the totals from report.json inside the embedded zip', () => {
    const zip = makeZip({
      'abc.json': '{}',
      'report.json': JSON.stringify({
        startTime: 1790000000000,
        stats: {
          total: 10,
          expected: 7,
          unexpected: 1,
          flaky: 0,
          skipped: 2,
          ok: false,
        },
      }),
    })
    assert.deepEqual(readPlaywrightStats(reportHtml(zip)), {
      passed: 7,
      failed: 1,
      flaky: 0,
      skipped: 2,
      startTime: 1790000000000,
    })
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
