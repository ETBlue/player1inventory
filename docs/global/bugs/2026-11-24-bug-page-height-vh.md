# Bug: extra space at the bottom of some pages on iOS

Date: 2026-11-24. Found by the owner in production, on an iPhone (iOS Safari, added to the
home screen).

## Bug description

The pantry shelf page and the item page show extra empty space at the bottom. Desktop
Firefox in its mobile view does not show it.

## Root cause

`Layout` (`apps/web/src/components/global/Layout/Layout.tsx`) is the only element that
should be sized to the viewport. It is `h-dvh`. Inside it, `<main>` gets its height from a
grid row and is a size container (`overflow-y-auto [container-type:size]`), so `100cqh` is
the real space a page has. About 25 pages already size themselves with `h-[100cqh]` or
`min-h-[100cqh]`, and `apps/design/src/content/docs/tokens/layout.mdx` documents that rule.

Twelve components broke it and used a viewport height instead:

| File | Class |
|---|---|
| `components/shared/LayoutInnerPages/LayoutInnerPages.tsx` (item page, settings detail pages) | `h-screen` |
| `components/pantry/ShelfDetailView.tsx`, `VendorDetailView.tsx`, `RecipeDetailView.tsx` | `h-screen` |
| `routes/onboarding.tsx` and four onboarding components | `min-h-screen` |
| `routes/sign-in.tsx`, `routes/sign-up.tsx` | `min-h-screen` |
| `components/shared/LoadingSpinner/LoadingSpinner.tsx` (not a page; a box) | `min-h-[50vh]` |

`100vh` is not the height of `main`:

- On iOS in home-screen mode, `100vh` can be taller than `100dvh`. A page of `100vh` inside
  a `main` of `100dvh` gives `main` extra scroll room, seen as empty space at the bottom.
- On the shelf, vendor and recipe pages the mobile bottom bar also shows, so `main` is
  `100dvh` minus the bar, and a `100vh` page is taller than `main` on every browser.

Desktop browsers have `100vh` equal to `100dvh`, which is why the mobile view of desktop
Firefox did not show the item page gap.

Not measured on the device: that `100vh` is taller than `100dvh` there is a reading of the
symptom.

The design guide made it worse: `apps/design/src/content/docs/tokens/layout.mdx` told
developers to use `h-screen` for level 2+ pages, in two code samples.

## Fix applied

One height rule for every page: only `Layout` uses a viewport unit (`h-dvh`). Every page
sizes itself to `main`:

| Change | Files |
|---|---|
| `h-screen` → `h-[100cqh]` | `LayoutInnerPages.tsx`, `ShelfDetailView.tsx`, `VendorDetailView.tsx`, `RecipeDetailView.tsx` |
| `min-h-screen` → `min-h-[100cqh]` | `routes/onboarding.tsx`, `OnboardingWelcome.tsx`, `TemplateOverview.tsx`, `TemplateItemsBrowser.tsx`, `TemplateVendorsBrowser.tsx`, `routes/sign-in.tsx`, `routes/sign-up.tsx` |
| `min-h-[50vh]` → `min-h-[50cqh]` | `LoadingSpinner.tsx` |

Why `h-[100cqh]` and not `h-full`: about 25 pages already use it, and `cqh` reads the
nearest size container (`main`) directly, so wrappers in between do not matter. The nested
onboarding parts keep `min-h-[100cqh]`: their parent has only a `min-height`, so `min-h-full`
would resolve to nothing and lose the vertical centring.

Docs: `apps/web/src/components/CLAUDE.md` (the `Layout` entry) and
`apps/design/src/content/docs/tokens/layout.mdx` now state the rule. The design guide's
`h-screen` samples are changed to `h-[100cqh]`, and its claim that level 2+ pages always hide
the bottom bar is corrected (the shelf, vendor and recipe detail pages show it).

## Test added

`apps/web/src/lib/pageHeightRule.test.ts`, 4 tests. jsdom has no layout, so the guard reads
the source: it walks `apps/web/src` (no tests, stories or generated files) and fails with
`file:line class` for any viewport height class (`h-screen`, `min-h-screen`, `h-[NNvh]`,
`h-dvh`, `svh`, `lvh` and the like). The only allowed one is `h-dvh` in `Layout.tsx`. It
also checks that the walk finds more than 300 files including `Layout.tsx`, so a broken walk
cannot pass.

- Before the fix: red, listing all 12 entries.
- Mutation checks, each red: `h-screen` back in `ShelfDetailView.tsx`; `min-h-screen` back
  in `sign-in.tsx`; `h-dvh` added to `routes/cooking.tsx`.
- Not covered: a viewport height in an inline `style`, a CSS file, or JavaScript.

Web tests 3965 → **3969** (381 files). Not checked on a real iPhone: the owner checks that
after the deploy.

## PR / commit

- Fix: `6be13f39` fix(web): size every page to the layout, not the viewport
- Doc: the commit that adds this file
