// Bundles the server into one file, `dist/index.js`, for `node dist/index.js`.
//
// WHY A BUNDLE: `@p1i/types` (packages/types) ships raw TypeScript — its
// `exports` map points at `./src/index.ts`. A plain `tsc` emit keeps the bare
// `@p1i/types` import, and Node then refuses to load a `.ts` file:
// `ERR_UNKNOWN_FILE_EXTENSION`. esbuild copies the workspace package's code
// into the bundle, so Node never sees the `.ts` file. See
// docs/global/backend/2026-11-13-build-shared-types-design.md.
//
// WHAT IS BUNDLED AND WHAT IS NOT:
// - `workspace:` packages (today only `@p1i/types`) are bundled in.
// - Every other dependency in package.json stays external and is read from
//   node_modules at runtime, as before. `@prisma/client` must stay external:
//   it loads its generated client and query engine from disk.
//   esbuild treats an external package name as covering its subpaths too, so
//   `@apollo/server/express4`-style imports stay external as well.
// - Node built-ins are external because `platform: 'node'`.
//
// The `.graphql` files are copied FLAT into `dist/`, next to the bundle. See
// the comment in src/schema/index.ts for why they go there.
//
// Type-checking is NOT done here. `build` in package.json runs `tsc --noEmit`
// before this script; esbuild only strips types.

import { build } from 'esbuild'
import { cpSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const schemaDir = join(root, 'src', 'schema')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
const external = Object.keys(allDeps).filter(
  (name) => !String(allDeps[name]).startsWith('workspace:'),
)

// Start from an empty dist/. Before this script, `tsc` emitted a whole tree
// here (dist/resolvers/…, dist/lib/…). A file left over from an old build
// could hide a failure, so nothing old may survive.
rmSync(dist, { recursive: true, force: true })

const result = await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: join(dist, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  external,
  logLevel: 'warning',
  metafile: true,
})

let copied = 0
for (const name of readdirSync(schemaDir)) {
  if (!name.endsWith('.graphql')) continue
  cpSync(join(schemaDir, name), join(dist, name))
  copied++
}

const bundled = Object.keys(result.metafile.inputs).filter((p) => !p.startsWith('src/'))
const size = statSync(join(dist, 'index.js')).size
console.log(
  `esbuild: dist/index.js ${(size / 1024).toFixed(1)} KiB, ` +
    `${Object.keys(result.metafile.inputs).length} input files ` +
    `(${bundled.length} outside src: ${bundled.join(', ') || 'none'}), ` +
    `${copied} .graphql files copied`,
)
