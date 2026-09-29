// Read the pass/fail totals out of a Playwright HTML report, for the landing page.
//
// Playwright 1.58 puts all report data inside `index.html`, as a zip file in
//   <script id="playwrightReportBase64" type="application/zip">data:application/zip;base64,…</script>
// The zip holds `report.json`, whose `stats` has `expected` (passed),
// `unexpected` (failed), `flaky` and `skipped`.
//
// That layout is internal to Playwright and can change in any release. So this
// module never throws: when anything does not look as expected it returns null,
// and the landing page shows the link without totals.

import { inflateRawSync } from 'node:zlib'

const TAG =
  /<script id="playwrightReportBase64"[^>]*>data:application\/zip;base64,([A-Za-z0-9+/=]+)<\/script>/

// Minimal zip reader: find `name` through the central directory and return its bytes.
function readZipEntry(zip, name) {
  // End of central directory record: signature 0x06054b50, at least 22 bytes from the end.
  let eocd = -1
  for (
    let i = zip.length - 22;
    i >= Math.max(0, zip.length - 22 - 0xffff);
    i--
  ) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const count = zip.readUInt16LE(eocd + 10)
  let at = zip.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) return null
    const method = zip.readUInt16LE(at + 10)
    const size = zip.readUInt32LE(at + 20)
    const nameLength = zip.readUInt16LE(at + 28)
    const extraLength = zip.readUInt16LE(at + 30)
    const commentLength = zip.readUInt16LE(at + 32)
    const local = zip.readUInt32LE(at + 42)
    const entryName = zip.toString('utf8', at + 46, at + 46 + nameLength)
    if (entryName === name) {
      if (zip.readUInt32LE(local) !== 0x04034b50) return null
      const start =
        local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const data = zip.subarray(start, start + size)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data)
      return null
    }
    at += 46 + nameLength + extraLength + commentLength
  }
  return null
}

/**
 * `{ passed, failed, flaky, skipped }` from the text of a Playwright report's
 * `index.html`, or null when it cannot be read.
 */
export function readPlaywrightStats(indexHtml) {
  try {
    const match = TAG.exec(String(indexHtml))
    if (!match) return null
    const entry = readZipEntry(Buffer.from(match[1], 'base64'), 'report.json')
    if (!entry) return null
    const report = JSON.parse(entry.toString('utf8'))
    const stats = report.stats
    const numbers = [
      stats?.expected,
      stats?.unexpected,
      stats?.flaky,
      stats?.skipped,
    ]
    if (!numbers.every(Number.isInteger)) return null
    const [passed, failed, flaky, skipped] = numbers
    // When the run started, in ms since 1970. Not always present; null then.
    const startTime = Number.isFinite(report.startTime)
      ? report.startTime
      : null
    return { passed, failed, flaky, skipped, startTime }
  } catch {
    return null
  }
}
