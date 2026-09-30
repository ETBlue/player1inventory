// Read the data inside a Playwright HTML report.
//
// Playwright 1.58 puts all report data inside `index.html`, as a zip file in
//   <script id="playwrightReportBase64" type="application/zip">data:application/zip;base64,…</script>
// The zip holds `report.json`, whose `stats` has `expected` (passed),
// `unexpected` (failed), `flaky` and `skipped`, and one JSON file per spec file.
//
// Two users:
// - the landing page reads the totals (`readPlaywrightStats`). That layout is
//   internal to Playwright and can change in any release, so this function
//   never throws: it returns null and the card shows the link without totals.
// - the secret guard (`guard.mjs`) reads every entry (`readReportZip` and
//   `readZipEntries`). Those THROW when the zip cannot be read, because the
//   guard must know that it could not check the report.

import { inflateRawSync } from 'node:zlib'

const TAG =
  /<script id="playwrightReportBase64"[^>]*>data:application\/zip;base64,([A-Za-z0-9+/=]+)<\/script>/

/** True when `html` has the tag that holds the embedded report zip. */
export function hasReportZipTag(html) {
  return String(html).includes('id="playwrightReportBase64"')
}

/** The embedded zip of a report's `index.html`, as bytes, or null when there is none. */
export function readReportZip(indexHtml) {
  const match = TAG.exec(String(indexHtml))
  return match ? Buffer.from(match[1], 'base64') : null
}

/**
 * Every entry of a zip, in central directory order, as `{ name, data }` with
 * the uncompressed bytes. A minimal reader: stored (0) and deflated (8)
 * entries, no zip64, no CRC check. Throws when anything does not look like a
 * zip it can read.
 */
export function readZipEntries(zip) {
  // End of central directory record: signature 0x06054b50, at least 22 bytes
  // from the end, followed by a comment of up to 0xffff bytes.
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
  if (eocd < 0) throw new Error('no end of central directory record')
  const count = zip.readUInt16LE(eocd + 10)
  let at = zip.readUInt32LE(eocd + 16)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50)
      throw new Error(`bad central directory record ${n}`)
    const method = zip.readUInt16LE(at + 10)
    const size = zip.readUInt32LE(at + 20) // compressed size
    const nameLength = zip.readUInt16LE(at + 28)
    const extraLength = zip.readUInt16LE(at + 30)
    const commentLength = zip.readUInt16LE(at + 32)
    const local = zip.readUInt32LE(at + 42)
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength)
    if (zip.readUInt32LE(local) !== 0x04034b50)
      throw new Error(`bad local header for ${name}`)
    // The local header has its own name and extra field lengths.
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    if (start + size > zip.length) throw new Error(`${name} is cut short`)
    const data = zip.subarray(start, start + size)
    if (method === 0) entries.push({ name, data })
    else if (method === 8) entries.push({ name, data: inflateRawSync(data) })
    else throw new Error(`${name} uses zip method ${method}`)
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/**
 * `{ passed, failed, flaky, skipped, startTime }` from the text of a
 * Playwright report's `index.html`, or null when it cannot be read.
 */
export function readPlaywrightStats(indexHtml) {
  try {
    const zip = readReportZip(indexHtml)
    if (!zip) return null
    const entry = readZipEntries(zip).find(({ name }) => name === 'report.json')
    if (!entry) return null
    const report = JSON.parse(entry.data.toString('utf8'))
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
