// Build the living spec sites from the latest test output. Nothing is uploaded.
//
//   spec-dist/       the public spec site for non-developers
//     index.html       landing page
//     local/ cloud/ pwa/   Playwright HTML reports (from `pnpm test:e2e:all`)
//     features/        the feature page (from `pnpm spec:vitest`)
//   spec-dist-dev/   the full Vitest UI report, for developers
//
// Run `pnpm spec:vitest` and `pnpm test:e2e:all` first, or use
// `pnpm spec:publish`, which runs everything. A missing report is not an error:
// its link says "Not run".
//
// Node built-ins only.

import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  countStatuses,
  escapeHtml,
  page,
  renderFeaturePage,
  selectFeatureTests,
} from './features.mjs'
import { readPlaywrightStats } from './playwright-stats.mjs'
import { findSecrets } from './secrets.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'spec-dist')
const OUT_DEV = join(ROOT, 'spec-dist-dev')
const VITEST_JSON = join(ROOT, 'apps/web/spec-report/vitest.json')
const VITEST_HTML = join(ROOT, 'apps/web/spec-report/html')
const VITEST_META = join(VITEST_HTML, 'html.meta.json.gz')

const PLAYWRIGHT = [
  {
    dir: 'local',
    name: 'Local mode',
    text: 'The app with data kept only in this browser.',
  },
  {
    dir: 'cloud',
    name: 'Cloud mode',
    text: 'The app with data saved to the cloud account.',
  },
  {
    dir: 'pwa',
    name: 'Offline (PWA)',
    text: 'The installed app without a network, and accessibility checks.',
  },
]

// ---------------------------------------------------------------------------
// 1. Secret guard. It runs before anything is deleted or written, so a failed
//    guard leaves both output folders as they were, and `publish.sh` stops
//    before any upload.
//
//    The report data (test source, `config.env`) is in `html.meta.json.gz`, so
//    that file is unzipped first. Every other file in the folder is checked
//    too, as it is, in case a later Vitest version stores data elsewhere.
// ---------------------------------------------------------------------------
const hasDevReport =
  existsSync(join(VITEST_HTML, 'index.html')) && existsSync(VITEST_META)
if (hasDevReport) {
  const problems = []
  for (const file of listFiles(VITEST_HTML)) {
    let text
    try {
      const bytes = readFileSync(file)
      text = (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString(
        'latin1',
      )
    } catch (error) {
      console.error(
        `spec:build: STOPPED. Cannot read ${relative(ROOT, file)} to check it for secrets: ${error.message}`,
      )
      process.exit(1)
    }
    for (const pattern of findSecrets(text))
      problems.push(`${pattern} in ${relative(ROOT, file)}`)
  }
  if (problems.length > 0) {
    console.error(
      'spec:build: STOPPED. The developer Vitest report contains text that looks like a secret:',
    )
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error(
      'Nothing was written. Find where the value comes from (often a VITE_ env variable) and remove it.',
    )
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// 2. The public spec site.
// ---------------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const cards = []

for (const project of PLAYWRIGHT) {
  const source = join(ROOT, 'playwright-report', project.dir)
  const index = join(source, 'index.html')
  if (!existsSync(index)) {
    console.warn(
      `spec:build: no Playwright report for "${project.dir}" — marked "Not run".`,
    )
    cards.push({ ...project, href: null })
    continue
  }
  cpSync(source, join(OUT, project.dir), { recursive: true })
  const stats = readPlaywrightStats(readFileSync(index, 'utf8'))
  if (!stats)
    console.warn(
      `spec:build: cannot read the totals of "${project.dir}"; the link is shown without them.`,
    )
  cards.push({ ...project, href: `${project.dir}/`, stats })
}

const features = {
  dir: 'features',
  name: 'Feature tests',
  text: 'What the app does, one sentence per test.',
}
if (existsSync(VITEST_JSON)) {
  const json = JSON.parse(readFileSync(VITEST_JSON, 'utf8'))
  mkdirSync(join(OUT, 'features'))
  writeFileSync(join(OUT, 'features', 'index.html'), renderFeaturePage(json))
  const totals = countStatuses(selectFeatureTests(json))
  const startTime = Number.isFinite(json.startTime) ? json.startTime : null
  cards.push({
    ...features,
    href: 'features/',
    stats: { ...totals, flaky: 0, startTime },
  })
} else {
  console.warn(
    'spec:build: no Vitest JSON at apps/web/spec-report/vitest.json — "Feature tests" marked "Not run".',
  )
  cards.push({ ...features, href: null })
}

writeFileSync(join(OUT, 'index.html'), renderLanding(cards))

// ---------------------------------------------------------------------------
// 3. The developer site: the Vitest UI report, copied as it is.
// ---------------------------------------------------------------------------
rmSync(OUT_DEV, { recursive: true, force: true })
if (hasDevReport) {
  // Copy exactly the folder the guard checked.
  cpSync(VITEST_HTML, OUT_DEV, { recursive: true })
} else {
  console.warn(
    'spec:build: no Vitest html report at apps/web/spec-report/html — spec-dist-dev/ not written.',
  )
}

console.log(`spec:build: spec-dist/ ${formatSize(folderSize(OUT))}`)
if (existsSync(OUT_DEV))
  console.log(`spec:build: spec-dist-dev/ ${formatSize(folderSize(OUT_DEV))}`)

// ---------------------------------------------------------------------------

function git(...args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function formatTime(ms) {
  return `${new Date(ms).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

function renderLanding(items) {
  const commit = git('rev-parse', '--short', 'HEAD') ?? 'unknown'
  const status = git('status', '--porcelain')
  const dirty = status ? ' (with changes that were not committed)' : ''

  const list = items
    .map((item) => {
      const lines = [
        `<strong>${escapeHtml(item.name)}</strong>`,
        `<span>${escapeHtml(item.text)}</span>`,
      ]
      if (!item.href) {
        lines.push('<span class="muted">Not run</span>')
        return `<div class="card">\n${lines.join('\n')}\n</div>`
      }
      const s = item.stats
      if (s) {
        const parts = [
          `✅ ${s.passed} passed`,
          `<span class="${s.failed ? 'fail' : ''}">❌ ${s.failed} failed</span>`,
        ]
        if (s.flaky) parts.push(`${s.flaky} flaky`)
        if (s.skipped) parts.push(`⏭ ${s.skipped} skipped`)
        lines.push(`<span>${parts.join(' · ')}</span>`)
        if (s.startTime)
          lines.push(
            `<span class="muted">Run on ${formatTime(s.startTime)}</span>`,
          )
      }
      return `<a class="card" href="${item.href}">\n${lines.join('\n')}\n</a>`
    })
    .join('\n')

  const body = `<h1>Player 1 Inventory — Spec</h1>
<p>These pages show what the app does, checked by automated tests. Each report lists the tests and whether they passed.</p>
<div class="cards">
${list}
</div>
<p class="muted">Built on ${formatTime(Date.now())} from commit ${escapeHtml(commit)}${dirty}.</p>`

  return page('Player 1 Inventory — Spec', body)
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

function folderSize(dir) {
  return listFiles(dir).reduce((total, file) => total + statSync(file).size, 0)
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}
