// Starts the BUILT server (`node dist/index.js`) and fails if it cannot start.
//
// WHY: `tsc`, `tsx` (pnpm dev) and Vitest all read the TypeScript source, so
// none of them runs the file production runs. A bundle that cannot start —
// for example `ERR_UNKNOWN_FILE_EXTENSION` from a workspace package left
// external, or a `.graphql` file that is not where the bundle reads it —
// passes all three and fails only on Railway. This script is the last step
// of `build`, so `pnpm --filter server build`, the root `pnpm build` and
// Railway's build all run it.
//
// WHAT "STARTED" MEANS: the process prints `Server ready at` (index.ts, in
// the `app.listen` callback). Before that line it has loaded every module,
// read every `.graphql` file, and run `ApolloServer.start()`, which checks the
// schema against the resolvers. Exiting first, or printing nothing within
// TIMEOUT_MS, is a failure, and the child's output is printed.
//
// NO SECRETS, NO NETWORK. Measured 2026-11-13: the server opens no database
// connection and makes no Clerk call at boot, and starts with an empty
// environment and no `.env` file at all. So the child gets a minimal
// environment of its own:
// - `PORT=0` lets the OS pick a free port, so it never takes 4000 or an E2E
//   port (5174, 5175, 5176, 4001).
// - `DATABASE_URL` and `DIRECT_URL` point at a closed local port. Prisma reads
//   `apps/server/.env` by itself when the client is built, but it never
//   overrides a variable that is already set, so the real URLs are not used.
//   If a future change connects at boot, the start fails here, loudly.
// - `E2E_TEST_MODE=false`, for the same reason: the start must not depend on
//   what the developer's `.env` says.
// - The working folder is a new empty temp folder, so `dotenv/config` finds
//   no `.env`.
//
// The child is always stopped before this script exits.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TIMEOUT_MS = 20_000
const READY = 'Server ready at'
const CLOSED_PORT_URL = 'postgresql://start-check@127.0.0.1:9/start-check'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'dist', 'index.js')
const cwd = mkdtempSync(join(tmpdir(), 'p1i-server-start-check-'))
const started = Date.now()

const child = spawn(process.execPath, ['--enable-source-maps', entry], {
  cwd,
  env: {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    PORT: '0',
    DATABASE_URL: CLOSED_PORT_URL,
    DIRECT_URL: CLOSED_PORT_URL,
    E2E_TEST_MODE: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
let finished = false

function finish(ok, reason) {
  if (finished) return
  finished = true
  clearTimeout(timer)
  const exited = child.exitCode !== null || child.signalCode !== null
  const done = () => {
    rmSync(cwd, { recursive: true, force: true })
    if (ok) {
      console.log(`start check: dist/index.js started in ${Date.now() - started} ms`)
      process.exit(0)
    }
    console.error(`start check FAILED: ${reason}`)
    console.error('--- output of node dist/index.js ---')
    console.error(output.trimEnd() || '(no output)')
    console.error('---')
    process.exit(1)
  }
  if (exited) return done()
  child.once('exit', done)
  child.kill('SIGTERM')
  // A server that ignores SIGTERM must not outlive the check.
  setTimeout(() => child.kill('SIGKILL'), 3_000).unref()
}

const timer = setTimeout(
  () => finish(false, `no "${READY}" line within ${TIMEOUT_MS} ms`),
  TIMEOUT_MS,
)

function onData(chunk) {
  output += chunk
  if (output.includes(READY)) finish(true)
}
child.stdout.setEncoding('utf-8').on('data', onData)
child.stderr.setEncoding('utf-8').on('data', onData)
child.on('error', (err) => finish(false, `could not spawn node: ${err.message}`))
child.on('exit', (code, signal) => {
  if (!finished) finish(false, `the server exited before it was ready (code ${code}, signal ${signal})`)
})
