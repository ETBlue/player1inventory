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
// It works in two phases:
//   1. Read every report, make every page in memory, and run the secret guard
//      on all of it. Nothing on disk changes in this phase.
//   2. Only when the guard found nothing: delete and write both output folders.
// So a failed guard leaves both folders as they were, and `publish.sh` stops
// before any upload.
//
// SPEC_ROOT sets the repo root. Only the tests use it (build.test.mjs).
//
// Node built-ins only.

import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  countFilesNotRun,
  countStatuses,
  escapeHtml,
  filesNotRunText,
  page,
  renderFeaturePage,
  selectFeatureTests,
} from './features.mjs'
import {
  listFiles,
  scanFolder,
  scanPlaywrightReport,
  scanText,
} from './guard.mjs'
import { readPlaywrightStats } from './playwright-stats.mjs'

const ROOT = process.env.SPEC_ROOT
  ? resolve(process.env.SPEC_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..', '..')
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

// ===========================================================================
// Phase 1: read, render and check. Nothing is written in this phase.
// ===========================================================================

/** Secret-like text found anywhere, as "<pattern> in <where>". */
const problems = []

// --- The developer site: the Vitest UI report. -----------------------------
// The report data (test source, `config.env`) is in `html.meta.json.gz`.
// `scanFolder` unzips it, and checks every other file in the folder too, in
// case a later Vitest version stores data elsewhere. A file it cannot read
// stops the build: this report is all or nothing.
const hasDevReport =
  existsSync(join(VITEST_HTML, 'index.html')) && existsSync(VITEST_META)
if (hasDevReport) {
  try {
    problems.push(...scanFolder(VITEST_HTML, 'apps/web/spec-report/html'))
  } catch (error) {
    console.error(
      `spec:build: STOPPED. Cannot check the developer Vitest report for secrets: ${error.message}`,
    )
    process.exit(1)
  }
}

// --- The public site: Playwright reports. ----------------------------------
const cards = []
/** Playwright report folders that passed the checks, to copy in phase 2. */
const copies = []

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
  // A report the guard cannot read is left out, and the rest of the site is
  // still built. It is not published unchecked, and one broken report does
  // not hide the others. A secret that IS found stops everything (below).
  try {
    problems.push(
      ...scanPlaywrightReport(source, `playwright-report/${project.dir}`),
    )
  } catch (error) {
    console.warn(
      `spec:build: WARNING: cannot check "${project.dir}" for secrets, so it is not published: ${error.message}`,
    )
    cards.push({
      ...project,
      href: null,
      note: 'Not published: this report could not be checked for secrets.',
    })
    continue
  }
  const stats = readPlaywrightStats(readFileSync(index, 'utf8'))
  if (!stats)
    console.warn(
      `spec:build: cannot read the totals of "${project.dir}"; the link is shown without them.`,
    )
  copies.push({ source, target: join(OUT, project.dir) })
  cards.push({ ...project, href: `${project.dir}/`, stats })
}

// --- The public site: the feature page. ------------------------------------
const features = {
  dir: 'features',
  name: 'Feature tests',
  text: 'What the app does, one sentence per test.',
}
let featureHtml = null
if (existsSync(VITEST_JSON)) {
  const json = JSON.parse(readFileSync(VITEST_JSON, 'utf8'))
  featureHtml = renderFeaturePage(json)
  problems.push(...scanText(featureHtml, 'spec-dist/features/index.html'))
  const totals = countStatuses(selectFeatureTests(json))
  const startTime = Number.isFinite(json.startTime) ? json.startTime : null
  cards.push({
    ...features,
    href: 'features/',
    stats: {
      ...totals,
      flaky: 0,
      filesNotRun: countFilesNotRun(json),
      startTime,
    },
  })
} else {
  console.warn(
    'spec:build: no Vitest JSON at apps/web/spec-report/vitest.json — "Feature tests" marked "Not run".',
  )
  cards.push({ ...features, href: null })
}

// --- The public site: the landing page. ------------------------------------
const landingHtml = renderLanding(cards)
problems.push(...scanText(landingHtml, 'spec-dist/index.html'))

// --- The guard result. -----------------------------------------------------
if (problems.length > 0) {
  console.error(
    'spec:build: STOPPED. The reports contain text that looks like a secret:',
  )
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(
    'Nothing was written. Find where the value comes from (often a VITE_ env variable) and remove it.',
  )
  console.error(
    'A test title or a comment in a test file can also trigger this: the developer report contains all test source.',
  )
  process.exit(1)
}

// ===========================================================================
// Phase 2: write. The guard has passed.
// ===========================================================================
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
// Copy exactly the folders the guard checked.
for (const { source, target } of copies)
  cpSync(source, target, { recursive: true })
if (featureHtml !== null) {
  mkdirSync(join(OUT, 'features'))
  writeFileSync(join(OUT, 'features', 'index.html'), featureHtml)
}
writeFileSync(join(OUT, 'index.html'), landingHtml)

rmSync(OUT_DEV, { recursive: true, force: true })
if (hasDevReport) {
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
        lines.push(
          `<span class="muted">${escapeHtml(item.note ?? 'Not run')}</span>`,
        )
        return `<div class="card">\n${lines.join('\n')}\n</div>`
      }
      const s = item.stats
      if (s) {
        const parts = [
          `✅ ${s.passed} passed`,
          `<span class="${s.failed ? 'fail' : ''}">❌ ${s.failed} failed</span>`,
        ]
        if (s.filesNotRun)
          parts.push(
            `<span class="fail">❌ ${filesNotRunText(s.filesNotRun)}</span>`,
          )
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

function folderSize(dir) {
  return listFiles(dir).reduce(
    (total, file) => total + statSync(join(dir, file)).size,
    0,
  )
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}
