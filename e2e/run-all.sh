#!/usr/bin/env bash
#
# Run the E2E projects one after another, and report every result.
#
# Four rows (E2E speed plan, task S.8, owner answer P6-A):
#
#   local       local mode, no backend
#   cloud       the cloud specs on the LOCAL E2E database   (E2E_DATABASE=local)
#   cloud-neon  the 8 NEON_SPECS files on the Neon test branch (E2E_DATABASE=neon)
#   pwa         the built app, offline and a11y
#
# With --full-neon (`pnpm test:e2e:all:neon`, owner answer P10-A, for a
# checkpoint release) there are three rows: `cloud` is left out, and
# `cloud-neon` runs the WHOLE cloud list on Neon (E2E_NEON_FULL=1).
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
# Each project also writes e2e-results/<project>.json (Playwright's JSON
# reporter), and the end of the run prints the slowest tests and the time per
# spec file from those files (scripts/spec/e2e-times.mjs). After each project,
# its test-results/ folder is copied to e2e-results/test-results-<project>/,
# because the next Playwright run deletes test-results/.
#
# The projects must run as separate commands, not as one `pnpm test:e2e`.
# See root CLAUDE.md -> Verification Gate for the measurements. `cloud` and
# `cloud-neon` could not share one command anyway: they use the same API
# server, and one server uses one database.
#
# Extra arguments (other than --full-neon) are passed to every project run, e.g.
#   pnpm test:e2e:all e2e/tests/a11y.spec.ts

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FULL_NEON=0
declare -a ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--full-neon" ]; then
    FULL_NEON=1
  else
    ARGS+=("$arg")
  fi
done

if [ "$FULL_NEON" -eq 1 ]; then
  PROJECTS=(local cloud-neon pwa)
  export E2E_NEON_FULL=1
  NEON_SCOPE="the whole cloud list"
else
  PROJECTS=(local cloud cloud-neon pwa)
  unset E2E_NEON_FULL
  NEON_SCOPE="the NEON_SPECS files (e2e/neonSpecs.ts)"
fi
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

# One JSON report per project, with the time of every test. The config adds the
# `json` reporter only when PLAYWRIGHT_JSON_OUTPUT_FILE is set. A `--reporter=…`
# argument replaces the config's reporters, so then no JSON is written.
RESULTS_DIR="e2e-results"
mkdir -p "$RESULTS_DIR"

for project in "${PROJECTS[@]}"; do
  # One report directory per project, so run 3 cannot overwrite runs 1 and 2.
  export PLAYWRIGHT_HTML_OUTPUT_DIR="playwright-report/$project"
  export PLAYWRIGHT_HTML_REPORT="playwright-report/$project"
  export PLAYWRIGHT_JSON_OUTPUT_FILE="$RESULTS_DIR/$project.json"
  # A file left by an earlier gate would be read as this run's times.
  rm -f "$PLAYWRIGHT_JSON_OUTPUT_FILE"
  # The database of this row. The config builds `cloud-neon` only with
  # E2E_DATABASE=neon, and passes the value to the API server; e2e/global-setup.ts
  # checks that the server really uses that database.
  if [ "$project" = "cloud-neon" ]; then
    export E2E_DATABASE=neon
  else
    export E2E_DATABASE=local
  fi

  echo ""
  echo "=============================================================="
  echo "  E2E project: $project (E2E_DATABASE=$E2E_DATABASE)"
  echo "=============================================================="

  start=$SECONDS
  pnpm exec playwright test --config=e2e/playwright.config.ts --project="$project" ${ARGS[@]+"${ARGS[@]}"} 2>&1 |
    tee "$LOGDIR/$project.log"
  code=${PIPESTATUS[0]}
  elapsed=$((SECONDS - start))

  # Keep this project's failure files (error-context.md, trace, screenshot).
  # The next Playwright run deletes test-results/, so without this copy a
  # failure in `local` loses its error text when `cloud` starts. A failed
  # copy only prints a warning: it never changes the exit code.
  saved="$RESULTS_DIR/test-results-$project"
  rm -rf "$saved"
  if [ -d test-results ]; then
    cp -R test-results "$saved" ||
      echo "WARNING: could not copy test-results/ to $saved"
  fi

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
printf '%-12s %-8s %-8s %s\n' "PROJECT" "RESULT" "TIME" "TESTS"

failed=0
for i in "${!PROJECTS[@]}"; do
  if [ "${CODES[$i]}" -eq 0 ]; then
    result="PASS"
  else
    result="FAIL(${CODES[$i]})"
    failed=1
  fi
  printf '%-12s %-8s %-8s %s\n' \
    "${PROJECTS[$i]}" "$result" \
    "$(printf '%dm%02ds' "$((TIMES[i] / 60))" "$((TIMES[i] % 60))")" \
    "${COUNTS[$i]}"
done

if [ "$FULL_NEON" -eq 1 ]; then
  echo "Databases: cloud-neon = the Neon test branch ($NEON_SCOPE)."
else
  echo "Databases: cloud = the local E2E database; cloud-neon = the Neon test branch ($NEON_SCOPE)."
fi

# The time of every test, from the JSON reports. Only a report: a missing or
# broken file prints a warning, and this step never changes the exit code.
echo ""
echo "=============================================================="
echo "  E2E times (from $RESULTS_DIR/<project>.json)"
echo "=============================================================="
json_files=()
for project in "${PROJECTS[@]}"; do
  json_files+=("$RESULTS_DIR/$project.json")
done
node scripts/spec/e2e-times.mjs "${json_files[@]}" ||
  echo "WARNING: scripts/spec/e2e-times.mjs failed; the times above may be missing."

echo ""
echo "HTML reports: playwright-report/<project>  (open with: pnpm exec playwright show-report playwright-report/<project>)"
echo "Failure files: $RESULTS_DIR/test-results-<project>/"

if [ "$failed" -ne 0 ]; then
  echo "At least one project failed."
  exit 1
fi

echo "All ${#PROJECTS[@]} projects passed."
