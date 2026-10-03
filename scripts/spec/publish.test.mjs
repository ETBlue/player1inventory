// Run with: pnpm test:spec
//
// Tests of publish.sh, mainly its credentials check. Each test:
//   - makes a fake repo root in a temp folder and points SPEC_ROOT at it, so
//     the script's `cd` and `rm -rf` happen there, not in the real checkout;
//   - puts fake `pnpm` and `curl` scripts first on PATH, and builds PATH from
//     only that folder plus /usr/bin and /bin. The real pnpm lives elsewhere
//     (under the Node install), so it cannot be found at all. The fake curl
//     answers like the Cloudflare API and never opens a network connection.
// Both fakes write one line per call to a log file, so a test can see what
// ran, in which order, and in which folder.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const PUBLISH = join(dirname(fileURLToPath(import.meta.url)), 'publish.sh')

const TOKEN = 'cfTOKENsecret_4b7e9a2d1c'
const ACCOUNT = 'acc123'

// The fake Cloudflare API. Like the real one, it reads the token only from
// the Authorization header. That header must come through curl's config on
// stdin (`--config -`); a token on the command line is not read.
const FAKE_CURL = `#!/bin/bash
config="$(cat)"
echo "curl $*" >> "$FAKE_LOG"
out=""; write=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    --output) out="$2"; shift 2 ;;
    --write-out) write="$2"; shift 2 ;;
    --config|--max-time) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
token="$(printf '%s\\n' "$config" | sed -n 's/^header = "Authorization: Bearer \\(.*\\)"$/\\1/p')"
api="https://api.cloudflare.com/client/v4"
reply() { printf '%s' "$2" > "$out"; printf '%s' "$1"; exit 0; }
if [ -n "$FAKE_CURL_FAIL" ]; then echo "curl: (6) Could not resolve host" >&2; exit 6; fi
case "$url" in
  "$api/user/tokens/verify")
    [ "$token" = "$FAKE_GOOD_TOKEN" ] ||
      reply 401 '{"success":false,"errors":[{"code":1000,"message":"Invalid API Token"}]}'
    reply 200 "{\\"result\\":{\\"id\\":\\"t1\\",\\"status\\":\\"\${FAKE_TOKEN_STATUS:-active}\\"},\\"success\\":true}" ;;
  "$api/accounts/"*"/pages/projects/"*)
    [ "$token" = "$FAKE_GOOD_TOKEN" ] || reply 401 '{"success":false}'
    rest="\${url#"$api/accounts/"}"
    account="\${rest%%/*}"
    project="\${url##*/}"
    [ "$account" = "$FAKE_ACCOUNT" ] || reply 403 '{"success":false}'
    case " $FAKE_MISSING_PROJECTS " in
      *" $project "*) reply 404 '{"success":false,"errors":[{"code":8000007}]}' ;;
    esac
    reply 200 '{"success":true}' ;;
esac
echo "fake curl: unexpected URL" >&2
exit 99
`

const FAKE_PNPM = `#!/bin/bash
echo "pnpm $* | cwd=$PWD | SPEC_REPORT=\${SPEC_REPORT:-}" >> "$FAKE_LOG"
case "$1" in
  spec:vitest) exit "\${FAKE_VITEST_EXIT:-0}" ;;
  spec:build) mkdir -p spec-dist spec-dist-dev ;;
esac
exit 0
`

let dir
let root
let log

function writeExec(path, content) {
  writeFileSync(path, content)
  chmodSync(path, 0o755)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spec-publish-'))
  root = join(dir, 'root')
  log = join(dir, 'calls.log')
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeExec(join(bin, 'curl'), FAKE_CURL)
  writeExec(join(bin, 'pnpm'), FAKE_PNPM)
  // Reports of an "earlier run", which the script must delete only once the
  // credentials are good.
  mkdirSync(join(root, 'apps/web/spec-report'), { recursive: true })
  writeFileSync(join(root, 'apps/web/spec-report/old.json'), '{}')
  mkdirSync(join(root, 'playwright-report'))
  writeFileSync(join(root, 'playwright-report/old.html'), '')
  writeFileSync(log, '')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function publish(env = {}) {
  const fullEnv = {
    PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
    HOME: dir,
    TMPDIR: dir,
    SPEC_ROOT: root,
    FAKE_LOG: log,
    FAKE_GOOD_TOKEN: TOKEN,
    FAKE_ACCOUNT: ACCOUNT,
    CLOUDFLARE_API_TOKEN: TOKEN,
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    ...env,
  }
  for (const key of Object.keys(fullEnv)) {
    if (fullEnv[key] === undefined) delete fullEnv[key]
  }
  const result = spawnSync('/bin/bash', [PUBLISH], {
    env: fullEnv,
    encoding: 'utf8',
  })
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  const output = `${result.stdout}\n${result.stderr}`
  // In every case: the token, or any part of it, is never printed, and it is
  // never on curl's command line.
  for (const text of [output, calls.join('\n')]) {
    assert.ok(!text.includes(TOKEN), 'the token was printed or put in argv')
    assert.ok(!text.includes(TOKEN.slice(-8)), 'part of the token was printed')
    assert.ok(!text.includes(TOKEN.slice(0, 8)), 'part of the token was printed')
  }
  return {
    code: result.status,
    output,
    pnpm: calls.filter((c) => c.startsWith('pnpm ')),
    curl: calls.filter((c) => c.startsWith('curl ')),
  }
}

function assertStoppedEarly(r) {
  assert.notEqual(r.code, 0)
  assert.deepEqual(r.pnpm, [], 'pnpm ran although the check failed')
  assert.match(r.output, /stopped before any test ran/)
  // The old reports are still there: the `rm -rf` did not run either.
  assert.ok(existsSync(join(root, 'apps/web/spec-report/old.json')))
  assert.ok(existsSync(join(root, 'playwright-report/old.html')))
}

describe('publish.sh credentials check', () => {
  it('stops when CLOUDFLARE_API_TOKEN is missing', () => {
    const r = publish({ CLOUDFLARE_API_TOKEN: undefined })
    assertStoppedEarly(r)
    assert.match(r.output, /not set: CLOUDFLARE_API_TOKEN\./)
    assert.match(r.output, /One-time setup/)
    assert.deepEqual(r.curl, [])
  })

  it('stops when CLOUDFLARE_API_TOKEN is empty', () => {
    const r = publish({ CLOUDFLARE_API_TOKEN: '' })
    assertStoppedEarly(r)
    assert.match(r.output, /not set: CLOUDFLARE_API_TOKEN\./)
  })

  it('stops when CLOUDFLARE_ACCOUNT_ID is missing', () => {
    const r = publish({ CLOUDFLARE_ACCOUNT_ID: undefined })
    assertStoppedEarly(r)
    assert.match(r.output, /not set: CLOUDFLARE_ACCOUNT_ID\./)
    assert.deepEqual(r.curl, [])
  })

  it('names both variables when both are missing', () => {
    const r = publish({
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_ACCOUNT_ID: undefined,
    })
    assertStoppedEarly(r)
    assert.match(r.output, /not set: CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID\./)
  })

  it('stops when Cloudflare rejects the token', () => {
    const r = publish({ FAKE_GOOD_TOKEN: 'some-other-token' })
    assertStoppedEarly(r)
    assert.match(r.output, /rejected CLOUDFLARE_API_TOKEN \(HTTP 401\)/)
    assert.equal(r.curl.length, 1)
    assert.match(r.curl[0], /\/user\/tokens\/verify$/)
  })

  it('stops when the token is valid but not active', () => {
    const r = publish({ FAKE_TOKEN_STATUS: 'disabled' })
    assertStoppedEarly(r)
    assert.match(r.output, /rejected CLOUDFLARE_API_TOKEN \(HTTP 200\)/)
  })

  it('stops when the Cloudflare API cannot be reached', () => {
    const r = publish({ FAKE_CURL_FAIL: '1' })
    assertStoppedEarly(r)
    assert.match(r.output, /could not reach the Cloudflare API/)
  })

  it('stops when the spec project does not exist', () => {
    const r = publish({ FAKE_MISSING_PROJECTS: 'p1i-spec' })
    assertStoppedEarly(r)
    assert.match(r.output, /Pages project "p1i-spec" does not exist/)
    assert.match(
      r.output,
      /pnpm exec wrangler pages project create p1i-spec --production-branch main/,
    )
  })

  it('stops when the developer project does not exist', () => {
    const r = publish({ FAKE_MISSING_PROJECTS: 'p1i-spec-dev' })
    assertStoppedEarly(r)
    assert.match(r.output, /Pages project "p1i-spec-dev" does not exist/)
    assert.match(
      r.output,
      /pnpm exec wrangler pages project create p1i-spec-dev --production-branch main/,
    )
    // It checked the spec project first, and that one passed.
    assert.equal(r.curl.length, 3)
  })

  it('checks the project names from SPEC_PAGES_PROJECT and SPEC_DEV_PAGES_PROJECT', () => {
    const r = publish({
      SPEC_PAGES_PROJECT: 'my-spec',
      SPEC_DEV_PAGES_PROJECT: 'my-spec-dev',
      FAKE_MISSING_PROJECTS: 'my-spec-dev',
    })
    assertStoppedEarly(r)
    assert.match(r.curl[1], /\/pages\/projects\/my-spec$/)
    assert.match(r.output, /pages project create my-spec-dev /)
  })

  it('stops when the account ID is wrong', () => {
    const r = publish({ CLOUDFLARE_ACCOUNT_ID: 'not-my-account' })
    assertStoppedEarly(r)
    assert.match(r.output, /cannot read Pages project "p1i-spec" \(HTTP 403\)/)
    assert.match(r.output, /Check CLOUDFLARE_ACCOUNT_ID/)
  })
})

describe('publish.sh with good credentials', () => {
  it('runs the tests, builds, and deploys both sites, in order', () => {
    const r = publish()
    assert.equal(r.code, 0, r.output)
    assert.match(r.output, /Cloudflare credentials OK/)
    assert.deepEqual(
      r.pnpm.map((c) => c.split(' | ')[0]),
      [
        'pnpm spec:vitest',
        'pnpm test:e2e:all',
        'pnpm spec:build',
        'pnpm exec wrangler pages deploy spec-dist --project-name p1i-spec --branch main',
        'pnpm exec wrangler pages deploy spec-dist-dev --project-name p1i-spec-dev --branch main',
      ],
    )
    // Every pnpm call ran in the temp root, with SPEC_REPORT=1.
    for (const call of r.pnpm) {
      assert.ok(call.endsWith(` | cwd=${root} | SPEC_REPORT=1`), call)
    }
    // The old reports were deleted, in the temp root.
    assert.ok(!existsSync(join(root, 'apps/web/spec-report')))
    assert.ok(!existsSync(join(root, 'playwright-report')))
  })

  it('still deploys when tests fail, then exits 1', () => {
    const r = publish({ FAKE_VITEST_EXIT: '1' })
    assert.equal(r.code, 1, r.output)
    assert.equal(r.pnpm.length, 5)
    assert.match(r.pnpm[3], /^pnpm exec wrangler pages deploy spec-dist /)
    assert.match(r.pnpm[4], /^pnpm exec wrangler pages deploy spec-dist-dev /)
  })
})
