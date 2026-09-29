#!/usr/bin/env bash
# Build the living spec sites and upload them to Cloudflare Pages.
#
#   spec-dist/      -> Pages project $SPEC_PAGES_PROJECT     (default p1i-spec)
#   spec-dist-dev/  -> Pages project $SPEC_DEV_PAGES_PROJECT (default p1i-spec-dev)
#
# It publishes even when tests fail: a failing test is something the reader
# should see. It still exits non-zero at the end, so a caller (a future CI job)
# can tell.
#
# It does NOT publish when `spec:build` fails. That includes the secret guard
# in build.mjs: a secret in the developer report stops both uploads.
#
# Needs a one-time `pnpm exec wrangler login`.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export SPEC_REPORT=1   # e2e/playwright.config.ts: a screenshot for every test
failed=0

# One after the other, never at the same time: parallel test runs starve the
# machine (root CLAUDE.md, Verification Gate).
pnpm spec:vitest    || failed=1
pnpm test:e2e:all   || failed=1

pnpm spec:build     || exit 1   # nothing safe to publish

pnpm exec wrangler pages deploy spec-dist \
  --project-name "${SPEC_PAGES_PROJECT:-p1i-spec}" --branch main || exit 1

if [ -d spec-dist-dev ]; then
  pnpm exec wrangler pages deploy spec-dist-dev \
    --project-name "${SPEC_DEV_PAGES_PROJECT:-p1i-spec-dev}" --branch main || exit 1
else
  echo "spec:publish: no spec-dist-dev/ (no Vitest html report) — developer site not updated."
fi

exit $failed
