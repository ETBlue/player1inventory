// Print the times inside Playwright JSON reports.
//
// `e2e/run-all.sh` writes one JSON report per project to
// `e2e-results/<project>.json` (PLAYWRIGHT_JSON_OUTPUT_FILE) and then runs:
//
//   node scripts/spec/e2e-times.mjs e2e-results/*.json
//
// For each project it prints:
// - the total time of the run (`stats.duration`),
// - the 15 slowest tests (file, title, seconds),
// - the time per spec file, largest first.
//
// Two rules decide what "the time of a test" is:
// - a test that was retried has one entry in `results[]` per attempt. All
//   attempts count, because the run waited for all of them.
// - suites nest: a file suite holds `describe` suites, and those can hold more.
//   Every level is walked, so a test inside a `describe` is not lost.
//
// A missing or broken file prints a warning and is skipped. The script never
// fails the gate: it only reports.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SLOWEST_TESTS = 15

/**
 * Every test in a Playwright JSON report, with its time in milliseconds.
 * Returns `{ project, file, title, ms }` per test (one per project the test
 * ran in).
 */
export function collectTests(report) {
  const out = []
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const ms = (test.results ?? []).reduce(
          (sum, r) => sum + (Number(r.duration) || 0),
          0,
        )
        out.push({
          project: test.projectName ?? '',
          file: spec.file ?? suite.file ?? '',
          title: [...titles, spec.title].join(' › '),
          ms,
        })
      }
    }
    for (const child of suite.suites ?? []) {
      // The file suite's title is the file path. Leave it out of the test
      // title; the file is printed in its own column.
      walk(child, [...titles, child.title])
    }
  }
  for (const fileSuite of report.suites ?? []) walk(fileSuite, [])
  return out
}

/** One summary per project: total, slowest tests, time per file. */
export function summarize(report, slowest = SLOWEST_TESTS) {
  const tests = collectTests(report)
  const projects = [...new Set(tests.map((t) => t.project))]
  return projects.map((project) => {
    const mine = tests.filter((t) => t.project === project)
    const byFile = new Map()
    for (const t of mine) byFile.set(t.file, (byFile.get(t.file) ?? 0) + t.ms)
    return {
      project,
      totalMs: Number(report.stats?.duration) || 0,
      testCount: mine.length,
      slowestTests: [...mine].sort((a, b) => b.ms - a.ms).slice(0, slowest),
      files: [...byFile.entries()]
        .map(([file, ms]) => ({ file, ms }))
        .sort((a, b) => b.ms - a.ms),
    }
  })
}

const seconds = (ms) => (ms / 1000).toFixed(1)
const minutes = (ms) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

/** The text block for one project's summary. */
export function formatSummary(summary) {
  const lines = [
    `== ${summary.project || '(no project)'}: total ${minutes(summary.totalMs)} (${seconds(summary.totalMs)} s), ${summary.testCount} tests`,
    '',
    `Slowest ${summary.slowestTests.length} tests (seconds):`,
  ]
  for (const t of summary.slowestTests) {
    lines.push(`  ${seconds(t.ms).padStart(7)}  ${t.file}  ${t.title}`)
  }
  lines.push('', 'Time per spec file (seconds):')
  for (const f of summary.files) {
    lines.push(`  ${seconds(f.ms).padStart(7)}  ${f.file}`)
  }
  return lines.join('\n')
}

/** Read and print each report. Warns and skips a missing or broken file. */
export function main(paths, log = console.log, warn = console.warn) {
  if (paths.length === 0) warn('e2e-times: no JSON report given')
  for (const path of paths) {
    let report
    try {
      report = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      warn(`e2e-times: WARNING: cannot read ${path} (${error.code ?? error.name})`)
      continue
    }
    const summaries = summarize(report)
    if (summaries.length === 0) {
      warn(`e2e-times: WARNING: ${path} holds no tests`)
      continue
    }
    for (const s of summaries) log(`\n${formatSummary(s)}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
