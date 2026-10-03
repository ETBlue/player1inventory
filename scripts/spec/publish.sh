#!/usr/bin/env bash
# Build the living spec sites and upload them to Cloudflare Pages.
#
#   spec-dist/      -> Pages project $SPEC_PAGES_PROJECT     (default p1i-spec)
#   spec-dist-dev/  -> Pages project $SPEC_DEV_PAGES_PROJECT (default p1i-spec-dev)
#
# It checks the Cloudflare credentials FIRST, before any test runs. The tests
# take about 16 minutes. Without this check, a missing or wrong token was only
# found at the very end. A failed check stops the script in seconds, with exit
# code 1 and a message that says what to fix.
#
# It publishes even when tests fail: a failing test is something the reader
# should see. It still exits non-zero at the end, so a caller (a future CI job)
# can tell.
#
# It does NOT publish when `spec:build` fails. That includes the secret guard
# in build.mjs: a secret in any report or generated page stops both uploads.
#
# Needs CLOUDFLARE_API_TOKEN (a scoped token with only Cloudflare Pages: Edit)
# and CLOUDFLARE_ACCOUNT_ID in the environment. See "One-time setup" in
# docs/global/testing/2026-09-28-living-spec-reports-design.md.
#
# SPEC_ROOT sets the repo root. Only the tests use it (publish.test.mjs), so
# that the `rm -rf` below runs in a temp folder, not in the real checkout.
#
# Never add `set -x` here: it would print the API token.
set -uo pipefail
ROOT="${SPEC_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" || exit 1

SETUP_DOC='docs/global/testing/2026-09-28-living-spec-reports-design.md, section "One-time setup"'
CF_API='https://api.cloudflare.com/client/v4'
SPEC_PROJECT="${SPEC_PAGES_PROJECT:-p1i-spec}"
SPEC_DEV_PROJECT="${SPEC_DEV_PAGES_PROJECT:-p1i-spec-dev}"

# Print a message and stop. Never pass the token value to this function.
fail() {
  echo "spec:publish: $*" >&2
  echo "spec:publish: stopped before any test ran. Nothing was published." >&2
  exit 1
}

# GET a Cloudflare API path. Prints the HTTP status code. The body goes to the
# file $CF_BODY. The token goes to curl through its config on stdin, so it is
# never on curl's command line (where `ps` shows it) and never in a message.
CF_BODY="$(mktemp)"
trap 'rm -f "$CF_BODY"' EXIT
cf_get() {
  printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" |
    curl --silent --show-error --max-time 30 --config - \
      --output "$CF_BODY" --write-out '%{http_code}' "$CF_API$1"
}

check_credentials() {
  # 1. Both variables are set and not empty.
  local missing=()
  [ -n "${CLOUDFLARE_API_TOKEN:-}" ] || missing+=(CLOUDFLARE_API_TOKEN)
  [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || missing+=(CLOUDFLARE_ACCOUNT_ID)
  if [ ${#missing[@]} -gt 0 ]; then
    fail "not set: ${missing[*]}. See $SETUP_DOC."
  fi

  # 2. The token is valid and active. This endpoint needs no permission.
  local code
  code="$(cf_get /user/tokens/verify)" ||
    fail "could not reach the Cloudflare API (curl failed)."
  if [ "$code" != 200 ] ||
    ! grep -Eq '"success"[[:space:]]*:[[:space:]]*true' "$CF_BODY" ||
    ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"active"' "$CF_BODY"; then
    fail "Cloudflare rejected CLOUDFLARE_API_TOKEN (HTTP $code). It is wrong, expired or disabled. See $SETUP_DOC."
  fi

  # 3. Both Pages projects exist, and the token can see them. This proves the
  #    account ID and the Cloudflare Pages permission.
  local project
  for project in "$SPEC_PROJECT" "$SPEC_DEV_PROJECT"; do
    code="$(cf_get "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$project")" ||
      fail "could not reach the Cloudflare API (curl failed)."
    case "$code" in
      200) ;;
      404)
        fail "Pages project \"$project\" does not exist in the account CLOUDFLARE_ACCOUNT_ID. Create it with: pnpm exec wrangler pages project create $project --production-branch main" ;;
      401 | 403)
        fail "the token cannot read Pages project \"$project\" (HTTP $code). Check CLOUDFLARE_ACCOUNT_ID, and that the token has Cloudflare Pages: Edit on that account. See $SETUP_DOC." ;;
      *)
        fail "unexpected HTTP $code when reading Pages project \"$project\"." ;;
    esac
  done
  echo "spec:publish: Cloudflare credentials OK ($SPEC_PROJECT, $SPEC_DEV_PROJECT)."
}

check_credentials

export SPEC_REPORT=1   # e2e/playwright.config.ts: a screenshot for every test
failed=0

# Delete the reports of an earlier run first. If a test run crashes before it
# writes its report, the old report would otherwise be published under this
# commit. With the folder gone, its card says "Not run". Vitest and
# `e2e/run-all.sh` (through Playwright's html reporter) create these folders
# again themselves.
rm -rf apps/web/spec-report playwright-report

# One after the other, never at the same time: parallel test runs starve the
# machine (root CLAUDE.md, Verification Gate).
pnpm spec:vitest    || failed=1
pnpm test:e2e:all   || failed=1

pnpm spec:build     || exit 1   # nothing safe to publish

pnpm exec wrangler pages deploy spec-dist \
  --project-name "$SPEC_PROJECT" --branch main || exit 1

if [ -d spec-dist-dev ]; then
  pnpm exec wrangler pages deploy spec-dist-dev \
    --project-name "$SPEC_DEV_PROJECT" --branch main || exit 1
else
  echo "spec:publish: no spec-dist-dev/ (no Vitest html report) — developer site not updated."
fi

exit $failed
