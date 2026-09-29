#!/usr/bin/env bash
# Build the living spec site and upload it to Cloudflare Pages.
#
#   spec-dist/      -> Pages project $SPEC_PAGES_PROJECT     (default p1i-spec)
#
# It publishes even when tests fail: a failing test is something the reader
# should see. It still exits non-zero at the end, so a caller (a future CI job)
# can tell.
#
# It does NOT publish when `spec:build` fails.
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

exit $failed
