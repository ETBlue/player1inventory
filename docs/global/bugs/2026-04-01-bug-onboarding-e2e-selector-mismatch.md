# Bug: Onboarding E2E selectors mismatch after UI string renames

**Date:** 2026-04-01  
**Branch:** `fix/e2e-dark-mode-contrast`

## Bug description

Two E2E tests time out because they look for button/heading text that was renamed in PR #163 (merged 2026-04-01).

- `user can select template items and complete onboarding` — times out clicking `'Choose from template'` button (now `'Choose from a template...'`)
- `user can view onboarding page without accessibility violations` — times out waiting for the same button

## Root cause

PR #163 (`93d3e8c`) changed two i18n strings in `en.json`:
- `onboarding.welcome.chooseTemplate`: `"Choose from template"` → `"Choose from a template..."`
- `onboarding.templateOverview.title` (heading): `"Choose from template"` → `"Build your pantry"`

Three E2E files still reference the old strings.

## Fix applied

Updated three E2E files with renamed strings (`'Choose from a template...'`, `'Build your pantry'`)

## Test added

Existing onboarding E2E spec (3 tests, all pass)

## PR/commit

commit `bc1e38b`, PR fix/e2e-dark-mode-contrast
