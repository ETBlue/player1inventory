// The "Feature tests" page of the living spec site.
//
// It reads Vitest's JSON report (`pnpm spec:vitest`) and lists every test whose
// own title starts with `user `. It is a pure function: no file access, so
// `features.test.mjs` can test it with a hand-made report.
//
// What must never reach this page: test source code, env values, absolute
// paths, failure messages (they hold paths and source lines). The page only
// prints section names, `describe` titles, test titles and counts.

const MARKER = '/apps/web/src/'

// Folder or file names that read badly when only split into words.
const NAMES = {
  index: 'Pantry', // `routes/index.tsx` is the pantry page
  __root: 'App',
  shouldRedirectToOnboarding: 'Onboarding', // routes/shouldRedirectToOnboarding.ts
  db: 'Database',
  lib: 'Library',
}

/** Escape text for use inside HTML, in element content and in attributes. */
export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// `shouldRedirectToOnboarding` → `Should redirect to onboarding`
function toWords(name) {
  if (NAMES[name]) return NAMES[name]
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The path of a test file relative to `apps/web/src`, with `/` separators.
 * Vitest writes absolute paths. They are used only here, and never printed.
 */
export function relativePath(absolutePath) {
  const path = String(absolutePath).replaceAll('\\', '/')
  const at = path.lastIndexOf(MARKER)
  if (at >= 0) return path.slice(at + MARKER.length)
  // Unknown layout: keep only the file name, so no folder name can leak.
  return path.split('/').pop()
}

/**
 * The section a test file belongs to, from its path relative to `apps/web/src`.
 *
 *   routes/items/$id/stock.test.tsx      → Items
 *   routes/settings/tags/$id.test.tsx    → Settings · Tags
 *   routes/index.test.tsx                → Pantry
 *   components/item/ItemCard/….test.tsx  → Components · Item
 *   hooks/useItems.test.ts               → Hooks
 *   bootstrap.test.ts                    → App
 *
 * Returns `{ name, rank }`. `rank` orders the sections: pages first, then
 * components, then the rest.
 */
export function sectionFor(relPath) {
  const parts = relPath.split('/')
  const file = parts.pop()
  // `cooking.cloud.test.tsx` → `cooking`
  const base = file.split('.')[0]

  if (parts[0] === 'routes') {
    // Route segments up to the first `$param`, e.g. `settings/tags/$id/items`
    // → `settings/tags`. The file itself is a segment too (`settings/tags.tsx`).
    const segments = []
    for (const segment of [...parts.slice(1), base]) {
      if (segment.startsWith('$')) break
      segments.push(segment)
    }
    // `settings/index` is the settings page itself. A bare `index` is the pantry.
    if (segments.length > 1 && segments.at(-1) === 'index') segments.pop()
    const name = segments.slice(0, 2).map(toWords).join(' · ')
    return { name, rank: 0 }
  }

  if (parts[0] === 'components' && parts[1]) {
    return { name: `Components · ${toWords(parts[1])}`, rank: 1 }
  }

  // A file straight under `src/` (for example `bootstrap.test.ts`).
  if (parts.length === 0) return { name: 'App', rank: 2 }

  return { name: toWords(parts[0]), rank: 2 }
}

/**
 * Every test whose own title starts with `user ` (case-sensitive, with the
 * space). The own `title` is used, not `fullName`: `fullName` starts with the
 * `describe` titles, so a test inside a `describe` would be missed.
 */
export function selectFeatureTests(vitestJson) {
  const tests = []
  for (const file of vitestJson?.testResults ?? []) {
    const { name, rank } = sectionFor(relativePath(file.name))
    for (const result of file.assertionResults ?? []) {
      if (typeof result.title !== 'string' || !result.title.startsWith('user '))
        continue
      tests.push({
        section: name,
        rank,
        group: (result.ancestorTitles ?? []).join(' › '),
        title: result.title,
        status: result.status,
      })
    }
  }
  return tests
}

/** `passed` / `failed` / `skipped` counts. Vitest's `pending` and `todo` count as skipped. */
export function countStatuses(tests) {
  const totals = { passed: 0, failed: 0, skipped: 0 }
  for (const test of tests) {
    if (test.status === 'passed') totals.passed++
    else if (test.status === 'failed') totals.failed++
    else totals.skipped++
  }
  return totals
}

const ICONS = {
  passed: ['✅', 'passed'],
  failed: ['❌', 'failed'],
  skipped: ['⏭', 'skipped'],
}

function icon(status) {
  const key = status === 'passed' || status === 'failed' ? status : 'skipped'
  const [symbol, label] = ICONS[key]
  return `<span class="icon" role="img" aria-label="${label}">${symbol}</span>`
}

/** Shared look for the feature page and the landing page. Light and dark. */
export const PAGE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #faf8f4; --fg: #26231f; --muted: #6b655c; --line: #e2ddd3;
  --card: #ffffff; --link: #1f5fa8; --fail: #b3261e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1a18; --fg: #ece8e1; --muted: #a8a197; --line: #3a3732;
    --card: #24221f; --link: #8ab8f0; --fail: #f2b8b5;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 .5rem; }
h2 { font-size: 1.25rem; margin: 2.5rem 0 .5rem; padding-top: .5rem; border-top: 1px solid var(--line); }
h3 { font-size: 1rem; margin: 1.25rem 0 .25rem; color: var(--muted); font-weight: 600; }
a { color: var(--link); }
p { margin: .5rem 0; }
.muted { color: var(--muted); }
.totals { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; margin: 1rem 0; font-weight: 600; }
.fail { color: var(--fail); }
ul { margin: .25rem 0; padding: 0; list-style: none; }
li { display: flex; gap: .5rem; padding: .2rem 0; overflow-wrap: anywhere; }
.icon { flex: none; }
.toc li { display: block; }
.cards { display: grid; gap: .75rem; margin: 1.5rem 0; }
.card { display: block; padding: 1rem; background: var(--card); border: 1px solid var(--line); border-radius: .5rem; text-decoration: none; color: var(--fg); }
.card strong { color: var(--link); font-size: 1.1rem; }
.card > span { display: block; }
`

/** A complete HTML document. `title` is escaped; `body` must already be safe HTML. */
export function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`
}

/** The feature page, as an HTML string. */
export function renderFeaturePage(vitestJson) {
  const tests = selectFeatureTests(vitestJson)
  const totals = countStatuses(tests)

  // Sections in order: pages, components, the rest; by name inside each rank.
  // Inside a section, groups and tests keep the order Vitest reported them in.
  const sections = new Map()
  for (const test of tests) {
    if (!sections.has(test.section)) {
      sections.set(test.section, {
        name: test.section,
        rank: test.rank,
        groups: new Map(),
      })
    }
    const groups = sections.get(test.section).groups
    if (!groups.has(test.group)) groups.set(test.group, [])
    groups.get(test.group).push(test)
  }
  const ordered = [...sections.values()].sort(
    (a, b) => a.rank - b.rank || a.name.localeCompare(b.name),
  )

  const toc = ordered
    .map((section, i) => {
      const count = [...section.groups.values()].reduce(
        (n, list) => n + list.length,
        0,
      )
      return `<li><a href="#s${i + 1}">${escapeHtml(section.name)}</a> <span class="muted">(${count})</span></li>`
    })
    .join('\n')

  const body = ordered
    .map((section, i) => {
      const groups = [...section.groups.entries()]
        .map(([group, list]) => {
          const heading = group ? `<h3>${escapeHtml(group)}</h3>\n` : ''
          const items = list
            .map(
              (test) =>
                `<li>${icon(test.status)}<span>${escapeHtml(test.title)}</span></li>`,
            )
            .join('\n')
          return `${heading}<ul>\n${items}\n</ul>`
        })
        .join('\n')
      return `<section>\n<h2 id="s${i + 1}">${escapeHtml(section.name)}</h2>\n${groups}\n</section>`
    })
    .join('\n')

  const started = Number(vitestJson?.startTime)
  const runDate =
    Number.isFinite(started) && started > 0
      ? `<p class="muted">Run on ${escapeHtml(new Date(started).toISOString().replace('T', ' ').slice(0, 16))} UTC.</p>`
      : ''

  const content = `<p><a href="../">← All reports</a></p>
<h1>Feature tests</h1>
<p>What the app does, written as sentences. Each line is one automated test of the web app.</p>
<p class="muted">This page lists only tests whose name starts with “user …”. The other unit tests are not shown.</p>
${runDate}
<div class="totals">
<span>✅ ${totals.passed} passed</span>
<span class="${totals.failed ? 'fail' : ''}">❌ ${totals.failed} failed</span>
<span>⏭ ${totals.skipped} skipped</span>
</div>
${tests.length === 0 ? '<p>No tests found.</p>' : `<h2>Contents</h2>\n<ul class="toc">\n${toc}\n</ul>`}
${body}`

  return page('Feature tests — Player 1 Inventory', content)
}
