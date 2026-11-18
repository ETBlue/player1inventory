import { expect, type Page } from '@playwright/test'
import { getViolations } from 'axe-playwright'

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

// ── Dialogs with a filled button: a KNOWN contrast defect ───────────────────
//
// Every button renders at `opacity-90` (`buttonVariants` base class,
// apps/web/src/components/ui/button.tsx). Inside a dialog, the FILLED
// variants then fail WCAG 2.1 SC 1.4.3 (4.5:1 for normal text) at rest.
// Measured by axe on 2026-11-18 in `household-invites.spec.ts` (cloud):
//
// | Button                      | Light                         | Dark                          |
// |-----------------------------|-------------------------------|-------------------------------|
// | destructive (the confirm)   | 3.92:1, #f7f1f4 on #ac6185    | 3.56:1, #3c3338 on #d1679d    |
// | primary (a dialog's submit) | 4.19:1, #eaf3f3 on #188080    | passes                        |
//
// The destructive row is the defect `a11y.spec.ts` already records
// (`KNOWN_CONFIRM_CONTRAST_EXCLUSION`, "~4.09:1 dark (modelled)"; measured,
// dark is 3.56:1). The primary row is NEW to the record, with the same
// cause: no a11y scan had opened a dialog with a primary submit before. The
// same buttons on a page, not in a dialog, pass. The owner ruled the
// `opacity-90` fix a follow-up on its own branch with its own visual review,
// so this file does not restyle `Button`.
//
// So a dialog scan excludes the filled buttons from the `color-contrast`
// RULE only, in two scans, like `checkA11yExcludingContrastOn` in
// `a11y.spec.ts`: every other WCAG AA rule still checks them, and a contrast
// failure on any other element still fails.
//
// REMOVAL CONDITION: once `opacity-90` is gone from `buttonVariants`, delete
// `KNOWN_FILLED_BUTTON_CONTRAST` and call `checkA11y(page, selector,
// AXE_OPTIONS)` instead of `checkDialogA11y`.
//
// The selectors name `button` on purpose. The same background classes are on
// other elements too (a primary or destructive Badge, a checked Switch, the
// ImportCard progress bar), and those must still be checked for contrast.
export const KNOWN_FILLED_BUTTON_CONTRAST = [
  ['button.bg-importance-destructive-background'],
  ['button.bg-importance-primary-background'],
]

/**
 * Scan the open dialog that `selector` finds (`[role="dialog"]` or
 * `[role="alertdialog"]`) with the WCAG AA rules, allowing only the known
 * filled-button contrast defect above.
 */
export async function checkDialogA11y(page: Page, selector: string) {
  // 1. Every WCAG AA rule except color-contrast, nothing excluded. `rules`
  //    beats `runOnly` for a named rule (axe checks `rules[id].enabled`
  //    before the tag filter).
  const other = await getViolations(page, selector, {
    ...AXE_RUN_OPTIONS,
    rules: { 'color-contrast': { enabled: false } },
  })
  expect(
    other.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`)),
    `non-contrast a11y violations in ${selector}`,
  ).toEqual([])

  // 2. color-contrast alone, without the known filled buttons.
  const contrast = await getViolations(
    page,
    { include: [[selector]], exclude: KNOWN_FILLED_BUTTON_CONTRAST },
    { runOnly: { type: 'rule', values: ['color-contrast'] } },
  )
  expect(
    contrast.flatMap((v) => v.nodes.map((n) => n.target.join(' '))),
    `color-contrast violations in ${selector} outside the known filled buttons`,
  ).toEqual([])
}
