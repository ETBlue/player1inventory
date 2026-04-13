# Rename index.tsx to ComponentName.tsx — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all 39 `index.tsx` component files to `ComponentName.tsx` and add thin barrel `index.ts` re-exports so VS Code Cmd+P can find components by name.

**Architecture:** Each component directory keeps its structure. `index.tsx` is renamed to `ComponentName.tsx`. A new `index.ts` barrel re-exports from `ComponentName.tsx` only, preserving all existing import paths unchanged.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Storybook

**Working directory:** `.worktrees/refactor-rename-index-tsx` (branch `refactor/rename-index-tsx`)

---

### Task 1: Commit design doc and plan

No code changes — just commit the two docs already written.

**Files:**
- Commit: `docs/global/refactoring/2026-04-13-rename-index-tsx-design.md`
- Commit: `docs/global/refactoring/2026-04-13-rename-index-tsx-plan.md`

- [ ] **Step 1: Verify worktree has the docs**

```bash
ls docs/global/refactoring/
```

Expected output:
```
2026-04-13-rename-index-tsx-design.md
2026-04-13-rename-index-tsx-plan.md
```

- [ ] **Step 2: Commit**

```bash
git add docs/global/refactoring/
git commit -m "docs(refactoring): add design doc and plan for rename index.tsx to ComponentName.tsx"
```

---

### Task 2: Rename all 39 index.tsx files and create barrel index.ts

For each component, rename `index.tsx` → `ComponentName.tsx` and create `index.ts` with `export * from './ComponentName'`.

All operations are under `apps/web/src/components/`. Run all commands from the worktree root.

**Files affected (39 renames + 39 new barrels):**

| Directory | Rename | New barrel |
|---|---|---|
| `global/Layout/` | `index.tsx` → `Layout.tsx` | `index.ts` |
| `global/Navigation/` | `index.tsx` → `Navigation.tsx` | `index.ts` |
| `global/PostLoginMigrationDialog/` | `index.tsx` → `PostLoginMigrationDialog.tsx` | `index.ts` |
| `global/Sidebar/` | `index.tsx` → `Sidebar.tsx` | `index.ts` |
| `item/ItemCard/` | `index.tsx` → `ItemCard.tsx` | `index.ts` |
| `item/ItemFilters/` | `index.tsx` → `ItemFilters.tsx` | `index.ts` |
| `item/ItemForm/` | `index.tsx` → `ItemForm.tsx` | `index.ts` |
| `item/ItemListToolbar/` | `index.tsx` → `ItemListToolbar.tsx` | `index.ts` |
| `item/ItemProgressBar/` | `index.tsx` → `ItemProgressBar.tsx` | `index.ts` |
| `onboarding/OnboardingWelcome/` | `index.tsx` → `OnboardingWelcome.tsx` | `index.ts` |
| `onboarding/TemplateItemsBrowser/` | `index.tsx` → `TemplateItemsBrowser.tsx` | `index.ts` |
| `onboarding/TemplateOverview/` | `index.tsx` → `TemplateOverview.tsx` | `index.ts` |
| `onboarding/TemplateVendorsBrowser/` | `index.tsx` → `TemplateVendorsBrowser.tsx` | `index.ts` |
| `recipe/CookingControlBar/` | `index.tsx` → `CookingControlBar.tsx` | `index.ts` |
| `recipe/RecipeCard/` | `index.tsx` → `RecipeCard.tsx` | `index.ts` |
| `recipe/RecipeInfoForm/` | `index.tsx` → `RecipeInfoForm.tsx` | `index.ts` |
| `settings/ConflictDialog/` | `index.tsx` → `ConflictDialog.tsx` | `index.ts` |
| `settings/DataModeCard/` | `index.tsx` → `DataModeCard.tsx` | `index.ts` |
| `settings/ExportCard/` | `index.tsx` → `ExportCard.tsx` | `index.ts` |
| `settings/FamilyGroupCard/` | `index.tsx` → `FamilyGroupCard.tsx` | `index.ts` |
| `settings/ImportCard/` | `index.tsx` → `ImportCard.tsx` | `index.ts` |
| `settings/LanguageCard/` | `index.tsx` → `LanguageCard.tsx` | `index.ts` |
| `settings/SettingsNavCard/` | `index.tsx` → `SettingsNavCard.tsx` | `index.ts` |
| `settings/ThemeCard/` | `index.tsx` → `ThemeCard.tsx` | `index.ts` |
| `shared/AddNameDialog/` | `index.tsx` → `AddNameDialog.tsx` | `index.ts` |
| `shared/DeleteButton/` | `index.tsx` → `DeleteButton.tsx` | `index.ts` |
| `shared/EmptyState/` | `index.tsx` → `EmptyState.tsx` | `index.ts` |
| `shared/FilterStatus/` | `index.tsx` → `FilterStatus.tsx` | `index.ts` |
| `shared/LoadingSpinner/` | `index.tsx` → `LoadingSpinner.tsx` | `index.ts` |
| `shared/Toolbar/` | `index.tsx` → `Toolbar.tsx` | `index.ts` |
| `tag/ColorSelect/` | `index.tsx` → `ColorSelect.tsx` | `index.ts` |
| `tag/EditTagTypeDialog/` | `index.tsx` → `EditTagTypeDialog.tsx` | `index.ts` |
| `tag/TagBadge/` | `index.tsx` → `TagBadge.tsx` | `index.ts` |
| `tag/TagDetailDialog/` | `index.tsx` → `TagDetailDialog.tsx` | `index.ts` |
| `tag/TagInfoForm/` | `index.tsx` → `TagInfoForm.tsx` | `index.ts` |
| `tag/TagTypeDropdown/` | `index.tsx` → `TagTypeDropdown.tsx` | `index.ts` |
| `tag/TagTypeInfoForm/` | `index.tsx` → `TagTypeInfoForm.tsx` | `index.ts` |
| `vendor/VendorCard/` | `index.tsx` → `VendorCard.tsx` | `index.ts` |
| `vendor/VendorInfoForm/` | `index.tsx` → `VendorInfoForm.tsx` | `index.ts` |

- [ ] **Step 1: Run all renames**

From the worktree root, run this script:

```bash
BASE=apps/web/src/components

components=(
  "global/Layout/Layout"
  "global/Navigation/Navigation"
  "global/PostLoginMigrationDialog/PostLoginMigrationDialog"
  "global/Sidebar/Sidebar"
  "item/ItemCard/ItemCard"
  "item/ItemFilters/ItemFilters"
  "item/ItemForm/ItemForm"
  "item/ItemListToolbar/ItemListToolbar"
  "item/ItemProgressBar/ItemProgressBar"
  "onboarding/OnboardingWelcome/OnboardingWelcome"
  "onboarding/TemplateItemsBrowser/TemplateItemsBrowser"
  "onboarding/TemplateOverview/TemplateOverview"
  "onboarding/TemplateVendorsBrowser/TemplateVendorsBrowser"
  "recipe/CookingControlBar/CookingControlBar"
  "recipe/RecipeCard/RecipeCard"
  "recipe/RecipeInfoForm/RecipeInfoForm"
  "settings/ConflictDialog/ConflictDialog"
  "settings/DataModeCard/DataModeCard"
  "settings/ExportCard/ExportCard"
  "settings/FamilyGroupCard/FamilyGroupCard"
  "settings/ImportCard/ImportCard"
  "settings/LanguageCard/LanguageCard"
  "settings/SettingsNavCard/SettingsNavCard"
  "settings/ThemeCard/ThemeCard"
  "shared/AddNameDialog/AddNameDialog"
  "shared/DeleteButton/DeleteButton"
  "shared/EmptyState/EmptyState"
  "shared/FilterStatus/FilterStatus"
  "shared/LoadingSpinner/LoadingSpinner"
  "shared/Toolbar/Toolbar"
  "tag/ColorSelect/ColorSelect"
  "tag/EditTagTypeDialog/EditTagTypeDialog"
  "tag/TagBadge/TagBadge"
  "tag/TagDetailDialog/TagDetailDialog"
  "tag/TagInfoForm/TagInfoForm"
  "tag/TagTypeDropdown/TagTypeDropdown"
  "tag/TagTypeInfoForm/TagTypeInfoForm"
  "vendor/VendorCard/VendorCard"
  "vendor/VendorInfoForm/VendorInfoForm"
)

for entry in "${components[@]}"; do
  dir=$(dirname "$entry")
  name=$(basename "$entry")
  mv "$BASE/$dir/index.tsx" "$BASE/$dir/$name.tsx"
  echo "export * from './$name'" > "$BASE/$dir/index.ts"
done
```

- [ ] **Step 2: Verify rename count**

```bash
find apps/web/src/components -name "index.tsx" | wc -l
```

Expected output: `0` (all renamed)

```bash
find apps/web/src/components -name "*.tsx" -not -name "*.stories*" -not -name "*.test*" | grep -v "/ui/" | sort | head -20
```

Expected: component files named `ComponentName.tsx`, not `index.tsx`.

```bash
find apps/web/src/components -name "index.ts" | wc -l
```

Expected output: `39` (one barrel per component)

- [ ] **Step 3: Spot-check one barrel**

```bash
cat apps/web/src/components/item/ItemCard/index.ts
```

Expected:
```ts
export * from './ItemCard'
```

---

### Task 3: Run quality gate

Verify TypeScript resolves all imports correctly through barrels, lint passes, tests pass, and Storybook builds.

- [ ] **Step 1: Lint**

```bash
(cd apps/web && pnpm lint)
```

Expected: no errors.

- [ ] **Step 2: TypeScript build**

```bash
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Expected: build succeeds, `grep` prints `OK: no deprecated imports`.

- [ ] **Step 3: Tests**

```bash
(cd apps/web && pnpm test --run)
```

Expected: 157 test files passed, 1186 tests passed (matching baseline).

- [ ] **Step 4: Storybook build**

```bash
(cd apps/web && pnpm build-storybook) 2>&1 | tail -5
```

Expected: build completes with no errors.

---

### Task 4: Commit the rename

- [ ] **Step 1: Stage all changes**

```bash
git add apps/web/src/components/
git status
```

Expected: 39 renamed files (`index.tsx` → `ComponentName.tsx`) and 39 new `index.ts` files staged.

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(components): rename index.tsx to ComponentName.tsx for VS Code discoverability

Add thin barrel index.ts in each component directory re-exporting from
ComponentName.tsx so existing import paths remain unchanged."
```

---

### Task 5: Update docs/INDEX.md

Mark the implementation as complete.

- [ ] **Step 1: Open `docs/INDEX.md` and find the row for this refactor**

```bash
grep -n "rename\|index.tsx\|ComponentName" docs/INDEX.md
```

If the row exists, update its status column from `🔲 Pending` to `✅`.

If no row exists, add one:

```markdown
| refactor/rename-index-tsx | Rename index.tsx → ComponentName.tsx | ✅ |
```

- [ ] **Step 2: Commit**

```bash
git add docs/INDEX.md
git commit -m "docs(index): mark rename index.tsx refactor as complete"
```
