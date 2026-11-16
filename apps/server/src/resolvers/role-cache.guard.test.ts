import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ── THE ROLE CACHE GUARD (review of households H5 task F.1) ──
//
// `locationRolesByLocation` and `locationIdsWithOrganizer` (lib/authz.ts) keep
// their answer for the whole request. The root fields of a mutation run one
// after another in ONE request, so a write that adds or removes a role row
// must call `forgetLocationRoles(ctx)`. Otherwise a later field reads a stale
// role: `mutation { a: createLocation … b: createLocation … }` gave `b`
// `myRole: null`.
//
// This test reads the SOURCE TEXT. For every resolver field in
// `src/resolvers/*.resolver.ts` that writes a role row, it checks that the
// same field calls `forgetLocationRoles(ctx)`. "Writes a role row" means one
// of the patterns in `WRITES`: a write to `LocationMember` or
// `HouseholdMember`, a location delete (its role rows go by ON DELETE
// CASCADE), or one of the two helpers that add an organizer row.
//
// What it CANNOT see: a write hidden behind a helper it does not know. So
// every file under `src/lib/` that writes a role row must be in
// `LIB_WRITERS`, with the reason it needs no forget. A new one fails here.
// The behaviour itself is tested in `location-roles.resolver.test.ts`
// ("the role cache inside one request").

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..')

const WRITES: RegExp[] = [
  /\.(locationMember|householdMember)\.(create|createMany|upsert|update|updateMany|delete|deleteMany)\(/,
  /\.location\.(delete|deleteMany)\(/,
  /\bcreateFirstLocation\(/,
  /\bcreateImportedLocation\(/,
]

// `createImportedLocation(ctx, …)` forgets by itself (checked below).
const FORGETS = /forgetLocationRoles\(ctx\)|createImportedLocation\(ctx\b/

/** Files under src/lib that write role rows, and why no cache is involved. */
const LIB_WRITERS: Record<string, string> = {
  'household.ts':
    'first sign-in runs inside `requireHousehold`, before any role cache can exist; `createFirstLocation` is also called by `clearAllData`, which forgets',
  'e2eCleanup.ts': 'an Express route, not GraphQL: it has no request cache',
  'e2eHouseholds.ts': 'an Express route, not GraphQL: it has no request cache',
}

function isSource(name: string): boolean {
  return name.endsWith('.ts') && !name.endsWith('.test.ts')
}

/** Each resolver field (`    name: async (…`) and the text up to the next one. */
function resolverFields(text: string): { name: string; body: string }[] {
  const lines = text.split('\n')
  const fields: { name: string; body: string }[] = []
  let current: { name: string; lines: string[] } | null = null
  for (const line of lines) {
    const match = /^ {4}(\w+): async \(/.exec(line)
    if (match?.[1]) {
      if (current) fields.push({ name: current.name, body: current.lines.join('\n') })
      current = { name: match[1], lines: [] }
    }
    current?.lines.push(line)
  }
  if (current) fields.push({ name: current.name, body: current.lines.join('\n') })
  return fields
}

describe('role cache guard', () => {
  const resolverFiles = readdirSync(here).filter((n) => n.endsWith('.resolver.ts'))

  it('every resolver field that writes a role row forgets the role cache', () => {
    const writers: string[] = []
    const missing: string[] = []
    for (const file of resolverFiles) {
      const text = readFileSync(join(here, file), 'utf8')
      for (const { name, body } of resolverFields(text)) {
        if (!WRITES.some((re) => re.test(body))) continue
        writers.push(name)
        if (!FORGETS.test(body)) missing.push(`${file}: ${name}`)
      }
    }
    expect(missing).toEqual([])
    // A check that found no writer at all would pass for the wrong reason.
    expect(writers.sort()).toEqual([
      'bulkCreateLocations',
      'bulkUpsertLocations',
      'clearAllData',
      'createLocation',
      'deleteLocation',
    ])
  })

  it('createImportedLocation forgets the role cache itself', () => {
    const text = readFileSync(join(here, 'import.resolver.ts'), 'utf8')
    const start = text.indexOf('async function createImportedLocation(')
    expect(start).toBeGreaterThan(-1)
    const end = text.indexOf('\n}\n', start)
    expect(text.slice(start, end)).toContain('forgetLocationRoles(ctx)')
  })

  it('every file under src/lib that writes a role row is listed, with its reason', () => {
    const libDir = join(src, 'lib')
    const found = readdirSync(libDir)
      .filter(isSource)
      .filter((n) => {
        const text = readFileSync(join(libDir, n), 'utf8')
        return WRITES.slice(0, 2).some((re) => re.test(text))
      })
      .sort()
    expect(found).toEqual(Object.keys(LIB_WRITERS).sort())
  })
})
