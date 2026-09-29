// Test helpers: build a Playwright-like HTML report with an embedded zip.
// Not a test file (the name does not end in `.test.mjs`), so `node --test`
// does not run it on its own.
import { deflateRawSync } from 'node:zlib'

// Build a zip the same shape Playwright writes: entries, a central directory,
// an end record. CRC fields are left at 0; the reader does not check them.
//
// Each entry is a string (deflated, no extra fields), or an object:
//   { data, method, level, localExtra, centralExtra, comment }
// `method` 0 is stored, 8 is deflated. `level` 0 deflates into "stored"
// blocks, so the compressed size is LARGER than the raw size. The extra
// fields and the comment are filler bytes that the reader must skip.
export function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, value] of Object.entries(entries)) {
    const spec = typeof value === 'string' ? { data: value } : value
    const method = spec.method ?? 8
    const nameBytes = Buffer.from(name)
    const raw = Buffer.from(spec.data)
    const data =
      method === 0 ? raw : deflateRawSync(raw, { level: spec.level ?? 6 })
    const localExtra = Buffer.alloc(spec.localExtra ?? 0, 0x41)
    const centralExtra = Buffer.alloc(spec.centralExtra ?? 0, 0x42)
    const comment = Buffer.from('c'.repeat(spec.comment ?? 0))
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(localExtra.length, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(centralExtra.length, 30)
    central.writeUInt16LE(comment.length, 32)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, localExtra, data)
    centrals.push(central, nameBytes, centralExtra, comment)
    offset += 30 + nameBytes.length + localExtra.length + data.length
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

export function reportHtml(zip) {
  return `<html><body><script id="playwrightReportBase64" type="application/zip">data:application/zip;base64,${zip.toString('base64')}</script></body></html>`
}
