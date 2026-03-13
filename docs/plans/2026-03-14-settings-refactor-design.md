# Settings Page Refactor — Design

**Date:** 2026-03-14

## Goal

Extract the remaining inline cards in `src/routes/settings/index.tsx` into standalone components following the `DataModeCard`/`FamilyGroupCard` pattern. Each component gets its own Storybook stories and unit tests.

## New Components

All live in `src/components/settings/`:

| Component | Internal hooks | Notes |
|---|---|---|
| `ThemeCard` | `useTheme`, `useTranslation` | Existing theme tests move from `settings/index.test.tsx` here |
| `LanguageCard` | `useLanguage`, `useTranslation` | New tests for language select behavior |
| `ExportCard` | `useTranslation` | Calls `exportAllData()`; rendered conditionally (local mode only) |
| `SettingsNavCard` | none | Props: `icon: LucideIcon`, `label: string`, `description: string`, `to: string` |

Each component has:
- `index.tsx` — component
- `index.stories.tsx` — Storybook stories
- `index.test.tsx` — unit tests

## Stories

- **ThemeCard**: `LightPreference`, `DarkPreference`, `SystemPreference` — set `localStorage['theme-preference']` in `beforeEach`
- **LanguageCard**: `AutoLanguage`, `ExplicitEnglish`, `ExplicitChineseTraditional` — set `localStorage['i18n-language']` in `beforeEach`
- **ExportCard**: `Default` — no setup needed
- **SettingsNavCard**: `TagsLink`, `VendorsLink`, `RecipesLink` — realistic settings nav data as props

## Tests

- `ThemeCard/index.test.tsx` — move all existing theme tests from `settings/index.test.tsx`; mock `useTheme`
- `LanguageCard/index.test.tsx` — new tests for language select behavior; mock `useLanguage`
- `ExportCard/index.test.tsx` — test button click calls `exportAllData()`; mock `exportAllData`
- `SettingsNavCard/index.test.tsx` — test icon, label, description render; test link `href`
- `settings/index.test.tsx` — strip theme tests; remove nav card tests if covered by `SettingsNavCard`

## Updated `settings/index.tsx`

The page becomes a thin composition. `useTheme` and `useLanguage` move into their cards. `useDataMode` stays for conditional rendering. `useTranslation` stays for `SettingsNavCard` label/description props.

```tsx
function Settings() {
  const { mode } = useDataMode()
  const { t } = useTranslation()

  return (
    <div>
      <Toolbar>
        <h1 className="px-3 py-2">{t('settings.title')}</h1>
      </Toolbar>
      <div className="space-y-px">
        <ThemeCard />
        <LanguageCard />
        <DataModeCard />
        {mode === 'cloud' && <FamilyGroupCard />}
        {mode === 'local' && <ExportCard />}
        <SettingsNavCard icon={Tags} label={t('settings.tags.label')} description={t('settings.tags.description')} to="/settings/tags" />
        <SettingsNavCard icon={Store} label={t('settings.vendors.label')} description={t('settings.vendors.description')} to="/settings/vendors" />
        <SettingsNavCard icon={CookingPot} label={t('settings.recipes.label')} description={t('settings.recipes.description')} to="/settings/recipes" />
      </div>
    </div>
  )
}
```

## File Structure After Refactor

```
src/components/settings/
  DataModeCard/         # existing
  FamilyGroupCard/      # existing
  ThemeCard/            # new
    index.tsx
    index.stories.tsx
    index.test.tsx
  LanguageCard/         # new
    index.tsx
    index.stories.tsx
    index.test.tsx
  ExportCard/           # new
    index.tsx
    index.stories.tsx
    index.test.tsx
  SettingsNavCard/      # new
    index.tsx
    index.stories.tsx
    index.test.tsx
```
