# Storybook Language Switch — Design

**Date:** 2026-03-19
**Area:** DX / Storybook
**Status:** Approved

## Problem

Stories that render translated content currently need separate per-language variants (e.g. `Default`, `TraditionalChinese`, `ExplicitEnglish`) or manual `localStorage` setup in `beforeEach`. This is repetitive and makes it hard to visually verify translations on-the-fly.

## Goal

Add a language toolbar toggle in Storybook (EN / TW / Auto) that:
1. Lets developers flip the active language while browsing any story
2. Eliminates the need for per-language story variants
3. Defaults to Auto (respects `localStorage` or browser language)

## Design

### Toolbar + Decorator (in `preview.tsx`)

**`globalTypes`** — add a `locale` global with a toolbar item:

```ts
globalTypes: {
  locale: {
    description: 'Active language',
    toolbar: {
      title: 'Language',
      icon: 'globe',
      items: [
        { value: 'auto', title: 'Auto' },
        { value: 'en',   title: 'EN' },
        { value: 'tw',   title: 'TW' },
      ],
      dynamicTitle: true,
    },
  },
},
initialGlobals: {
  locale: 'auto',
},
```

**`withI18n` decorator** — runs before every story:

```ts
const withI18n: Decorator = (Story, context) => {
  const locale = context.globals.locale ?? 'auto'

  if (locale === 'auto') {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    i18n.changeLanguage(resolveLanguageFromStorage())
  } else {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale)
    i18n.changeLanguage(locale)
  }

  return Story()
}
```

Added to `decorators` array alongside the existing `withDocsTheme` decorator.

No changes to `main.ts`. No new packages.

### Story Consolidation

Stories with per-language variants are consolidated to a single story. The toolbar controls the language.

**Affected files:**
- `src/routes/settings/index.stories.tsx` — 3 variants → 1 (`Default`)
- `src/components/settings/LanguageCard/index.stories.tsx` — 3 variants → 1 (`Default`)

**Pattern:**

Before:
```tsx
export const Default: Story = { render: () => <DefaultStory /> }
export const TraditionalChinese: Story = { render: () => <TraditionalChineseStory /> }
export const ExplicitEnglish: Story = { render: () => <ExplicitEnglishStory /> }
```

After:
```tsx
export const Default: Story = { render: () => <StoryComponent /> }
```

Any `beforeEach` that manually sets `localStorage` for language is removed — the decorator handles it.

### Testing

Smoke tests (`.stories.test.tsx`) continue to work unchanged. The test environment (jsdom) has `navigator.language = 'en'`, so Auto resolves to EN — existing EN assertions remain valid.

Removed story variants have their corresponding smoke test assertions removed as well.

## Trade-offs Considered

| Option | Verdict |
|--------|---------|
| Globals + decorator (i18n only) | Rejected — `useLanguage` hook (reads localStorage) would show stale state |
| **Globals + decorator (i18n + localStorage sync)** | **Chosen** — consistent across all components, no new dependencies |
| `storybook-react-i18next` addon | Rejected — adds a dependency, less control over Auto behavior |

## Files Changed

| File | Change |
|------|--------|
| `apps/web/.storybook/preview.tsx` | Add `globalTypes`, `initialGlobals`, `withI18n` decorator |
| `apps/web/src/routes/settings/index.stories.tsx` | Consolidate 3 → 1 story |
| `apps/web/src/components/settings/LanguageCard/index.stories.tsx` | Consolidate 3 → 1 story |
| Matching `.stories.test.tsx` files | Remove assertions for deleted variants |
