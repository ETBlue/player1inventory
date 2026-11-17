// The axe rule set every a11y scan uses. Shared by `e2e/tests/a11y.spec.ts`
// (the `local` and `pwa` projects) and the cloud-only scans in
// `e2e/tests/location-switcher.spec.ts` (households H5 task F.4), so both
// check the same rules. Moved here from `a11y.spec.ts` in that task.
//
// WCAG AA target: 4.5:1 contrast ratio for normal text, 3:1 for large text.
//
// FIXED 2026-10-11 (issue #322 task 3). Until that date these four tags were
// passed at the TOP level of the third argument. `checkA11y`'s third parameter is
// axe-playwright's own `AxeOptions` wrapper, and it forwards only
// `axeOptions.axeOptions` to axe (`axe-playwright/dist/index.js:111`), so the
// object was dropped and **axe ran with its own defaults for a year**. The comment
// that used to sit here said the level was "explicitly set"; it was not.
//
// THE OLD BEHAVIOUR WAS STRICTER, NOT LAXER, so no violation was missed. Axe's
// default set is the 89 rules with `enabled !== false` and no `experimental` /
// `deprecated` tag; these four tags select 62. Measured 2026-10-11 over 130 scans
// (64 in `local`, 66 in `pwa`), the switch costs 28 rules and gains 1:
//
//   STOPPED RUNNING — all 28 are tagged `best-practice`, none of them WCAG:
//     accesskeys, aria-allowed-role, aria-dialog-name, aria-text,
//     aria-treeitem-name, empty-heading, empty-table-header, frame-tested,
//     heading-order, image-redundant-alt, label-title-only,
//     landmark-banner-is-top-level, landmark-complementary-is-top-level,
//     landmark-contentinfo-is-top-level, landmark-main-is-top-level,
//     landmark-no-duplicate-banner, landmark-no-duplicate-contentinfo,
//     landmark-no-duplicate-main, landmark-one-main, landmark-unique,
//     meta-viewport-large, page-has-heading-one, presentation-role-conflict,
//     region, scope-attr-valid, skip-link, tabindex, table-duplicate-name
//
//   STARTED RUNNING — `target-size` (wcag22aa, SC 2.5.8). Axe ships it
//     `enabled: false`, so the default run skipped it. A tag filter overrides
//     `enabled` (`matchTags` in axe.js:19848), so naming `wcag22aa` turns it on.
//
// NONE of the 28 reported a violation or an incomplete on any of the 130 scans,
// and `target-size` passed all 130, which is why the narrowing was taken. To widen
// again, add `'best-practice'` to the list below — nothing else changes.
export const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

// Bare axe `RunOptions`, for `getViolations`, which takes them directly.
export const AXE_RUN_OPTIONS = {
  runOnly: { type: 'tag' as const, values: WCAG_AA_TAGS },
}

// The same options NESTED, for `checkA11y`, which wants them under `axeOptions`.
// Keep the nesting: flattening it type-errors with TS2559 and silently restores
// axe's defaults.
export const AXE_OPTIONS = { axeOptions: AXE_RUN_OPTIONS }
