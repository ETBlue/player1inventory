#!/usr/bin/env bash
#
# Run the three E2E projects one after another, and report all three results.
#
# Why this script exists, and what a plain `a && b && c` gets wrong:
#
#   1. `&&` stops at the first failing project, so the other two never run and
#      one red project hides the state of the rest.
#   2. The HTML reporter writes to ONE directory. Without a per-project
#      directory, run 3 overwrites the reports of runs 1 and 2.
#   3. The HTML reporter opens a browser when a run fails. That blocks a
#      non-interactive run forever.
#
# The three projects must run as three separate commands, not as one
# `pnpm test:e2e`. See root CLAUDE.md -> Verification Gate for the measurements.
#
# Extra arguments are passed to every project run, e.g.
#   pnpm test:e2e:all --reporter=line

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECTS=(local cloud pwa)
declare -a CODES=()
declare -a TIMES=()
declare -a COUNTS=()

# Per-project copies of the output, so the summary can repeat each project's
# own "N passed / N failed / N skipped" line instead of just an exit code.
LOGDIR="$(mktemp -d)"
trap 'rm -rf "$LOGDIR"' EXIT

# Never open a browser on failure — both the current and the legacy env var name.
export PLAYWRIGHT_HTML_OPEN=never
export PW_TEST_HTML_REPORT_OPEN=never

for project in "${PROJECTS[@]}"; do
  # One report directory per project, so run 3 cannot overwrite runs 1 and 2.
  export PLAYWRIGHT_HTML_OUTPUT_DIR="playwright-report/$project"
  export PLAYWRIGHT_HTML_REPORT="playwright-report/$project"

  echo ""
  echo "=============================================================="
  echo "  E2E project: $project"
  echo "=============================================================="

  start=$SECONDS
  pnpm exec playwright test --config=e2e/playwright.config.ts --project="$project" "$@" 2>&1 |
    tee "$LOGDIR/$project.log"
  code=${PIPESTATUS[0]}
  elapsed=$((SECONDS - start))

  # Playwright's closing block lists one line per outcome, e.g. "170 passed (7.3m)".
  counts=$(grep -oE '[0-9]+ (passed|failed|skipped|flaky|interrupted|did not run)' \
    "$LOGDIR/$project.log" | tail -6 | paste -sd, - | sed 's/,/, /g')
  [ -z "$counts" ] && counts='no counts found'

  CODES+=("$code")
  TIMES+=("$elapsed")
  COUNTS+=("$counts")
done

echo ""
echo "=============================================================="
echo "  E2E summary"
echo "=============================================================="
printf '%-10s %-8s %-8s %s\n' "PROJECT" "RESULT" "TIME" "TESTS"

failed=0
for i in "${!PROJECTS[@]}"; do
  if [ "${CODES[$i]}" -eq 0 ]; then
    result="PASS"
  else
    result="FAIL(${CODES[$i]})"
    failed=1
  fi
  printf '%-10s %-8s %-8s %s\n' \
    "${PROJECTS[$i]}" "$result" \
    "$(printf '%dm%02ds' "$((TIMES[i] / 60))" "$((TIMES[i] % 60))")" \
    "${COUNTS[$i]}"
done

echo ""
echo "HTML reports: playwright-report/<project>  (open with: pnpm exec playwright show-report playwright-report/<project>)"

if [ "$failed" -ne 0 ]; then
  echo "At least one project failed."
  exit 1
fi

echo "All three projects passed."
