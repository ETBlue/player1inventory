# Design: Inline import progress on TemplateOverview

**Date:** 2026-03-30
**Branch:** feature-onboarding-b

## Context

The current onboarding flow has a separate `progress` step: after clicking Confirm, the user is taken to a full-screen `OnboardingProgress` component that shows a progress bar, then a "Get started" button when complete. This adds an unnecessary extra step.

The new requirement: trigger the import mutation directly from `TemplateOverview`, show a loading state in place, and automatically navigate to `/` when done. No separate progress screen.

## New flow

```
TemplateOverview
  → [Confirm clicked] → mutation starts
    → Confirm button: disabled + spinner
    → [success] → localStorage.removeItem('onboarding-dismissed') → navigate('/')
    → [error]   → inline error message below action buttons + Confirm re-enabled for retry
```

## Changes to `onboarding.tsx`

1. **Remove** `{ type: 'progress' }` from the `OnboardingStep` union.
2. **Remove** `progressPct` state and `setProgressPct`.
3. **Remove** the `useEffect` that triggers the mutation on step change.
4. **Move** `setupMutation.mutate(...)` call directly into `onConfirm` on `TemplateOverview`.
5. **Add** a `useEffect` that watches `setupMutation.isSuccess` → navigates to `/` and clears `onboarding-dismissed`.
6. **Pass** `isLoading={setupMutation.isPending}` and `error={setupMutation.isError ? setupMutation.error : null}` to `TemplateOverview`.
7. **Remove** the `OnboardingProgress` step render block.
8. **Remove** the `OnboardingProgress` import.

## Changes to `TemplateOverview`

1. **Add** `isLoading?: boolean` prop — when true, Confirm button shows `<Loader2 className="animate-spin" />` and is disabled.
2. **Add** `error?: Error | null` prop — when non-null, render an inline error message below the action buttons row.
3. **Keep** `onConfirm` unchanged — the parent calls `mutate()` inside the handler.

### Updated props

```ts
interface TemplateOverviewProps {
  selectedItemCount: number
  selectedVendorCount: number
  totalItemCount: number
  totalVendorCount: number
  onEditItems: () => void
  onEditVendors: () => void
  onBack: () => void
  onConfirm: () => void
  isLoading?: boolean          // ← new
  error?: Error | null         // ← new
}
```

### Confirm button (loading state)

```tsx
<Button
  type="button"
  variant="primary"
  className="flex-1"
  onClick={onConfirm}
  disabled={isConfirmDisabled || isLoading}
>
  {isLoading ? (
    <Loader2 className="animate-spin" />
  ) : (
    <Check />
  )}
  {t('onboarding.templateOverview.confirm')}
</Button>
```

### Error message

Rendered below the action buttons row when `error` is non-null:

```tsx
{error && (
  <p className="text-sm text-destructive text-center">
    {t('onboarding.templateOverview.importError')}
  </p>
)}
```

## New i18n key

Add to `en.json` and `tw.json` under `onboarding.templateOverview`:

```json
"importError": "Something went wrong. Please try again."
```

```json
"importError": "匯入失敗，請再試一次。"
```

## Deleted files

- `apps/web/src/components/onboarding/OnboardingProgress/index.tsx`
- `apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.tsx`
- `apps/web/src/components/onboarding/OnboardingProgress/OnboardingProgress.stories.test.tsx`

## What is NOT changed

- `useOnboardingSetup` hook is unchanged — it still accepts `onProgress` but that callback is no longer used (can be omitted).
- `TemplateOverview` stories: add `Loading` and `WithError` stories; update smoke test to cover loading state.
- `onboarding.tsx` stories: update to reflect the 4-step state machine (no `progress` step).
