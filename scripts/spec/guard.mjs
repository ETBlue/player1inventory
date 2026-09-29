// The secret guard: look for secret-like text in everything `build.mjs` is
// about to publish. `build.mjs` runs it before it deletes or writes anything.
//
// A plain text scan is not enough. Two report formats pack their data:
// - the Vitest html report keeps it in `html.meta.json.gz` (gzip)
// - a Playwright html report keeps it in a zip, base64-encoded inside a
//   <script id="playwrightReportBase64"> tag of its `index.html`
// So `.gz` files are unzipped, `.zip` files and the embedded report zip are
// read entry by entry, and every entry is scanned.
//
// Images are skipped: they hold no text we can check. Every other file or zip
// entry is scanned as text, even when it is binary. A false match only stops
// a publish, which is safe.
//
// Any file this module cannot read makes it THROW. The caller decides what an
// unchecked file means; it must never be published as if it were checked.

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  hasReportZipTag,
  readReportZip,
  readZipEntries,
} from './playwright-stats.mjs'
import { findSecrets } from './secrets.mjs'

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
])

/** True for a file or zip entry name that is an image. */
export function isImage(name) {
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase())
}

/** Problems found in a string, as "<pattern> in <where>". */
export function scanText(text, where) {
  return findSecrets(text).map((pattern) => `${pattern} in ${where}`)
}

/** Problems found in every entry of a zip. Throws when the zip cannot be read. */
export function scanZip(zip, where) {
  const problems = []
  for (const { name, data } of readZipEntries(zip)) {
    if (isImage(name)) continue
    problems.push(...scanText(data.toString('latin1'), `${where} → ${name}`))
  }
  return problems
}

/**
 * Problems found in one file's bytes. `where` names the file in messages.
 * Throws when a packed file (gzip, zip, embedded report zip) cannot be read.
 */
export function scanBytes(bytes, where) {
  if (isImage(where)) return []
  if (where.endsWith('.gz')) {
    return scanText(gunzipSync(bytes).toString('latin1'), where)
  }
  if (where.endsWith('.zip')) return scanZip(bytes, where)
  const text = bytes.toString('latin1')
  const problems = scanText(text, where)
  if (where.endsWith('.html') && hasReportZipTag(text)) {
    const zip = readReportZip(text)
    if (!zip) throw new Error(`cannot find the report zip in ${where}`)
    problems.push(...scanZip(zip, where))
  }
  return problems
}

/**
 * Problems found in every file under `dir`. `label` is the name printed for
 * `dir` (a path relative to the repo, never an absolute one).
 * Throws when a file cannot be read.
 */
export function scanFolder(dir, label) {
  const problems = []
  for (const name of listFiles(dir)) {
    const where = `${label}/${name}`
    let bytes
    try {
      bytes = readFileSync(join(dir, name))
    } catch (error) {
      throw new Error(`cannot read ${where}: ${error.message}`)
    }
    try {
      problems.push(...scanBytes(bytes, where))
    } catch (error) {
      throw new Error(`cannot read ${where}: ${error.message}`)
    }
  }
  return problems
}

/**
 * Like `scanFolder`, for one Playwright html report. It also throws when the
 * report's `index.html` has no embedded zip: then Playwright has changed where
 * it keeps the data, and a plain scan may miss it.
 */
export function scanPlaywrightReport(dir, label) {
  const index = readFileSync(join(dir, 'index.html'), 'latin1')
  if (!hasReportZipTag(index))
    throw new Error(
      `${label}/index.html has no embedded report zip (the Playwright report layout has changed)`,
    )
  return scanFolder(dir, label)
}

/** Paths of all files under `dir`, relative to `dir`, with `/` separators. */
export function listFiles(dir, prefix = '') {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      return entry.isDirectory() ? listFiles(dir, path) : [path]
    },
  )
}
