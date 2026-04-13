# Design Guide

**Date:** 2026-04-13
**Branch:** `feature/design-guide`
**Status:** 🔲 Pending

---

## Goal

Build a public design guide for Player 1 Inventory and deploy it as a design showcase at `design.player1inventory.etblue.tw`. A companion Storybook instance deploys to `storybook.player1inventory.etblue.tw`.

---

## Architecture

### New app: `apps/design/`

An Astro/Starlight static site that serves as the public-facing design system documentation. Lives alongside `apps/web/` in the monorepo.

```
apps/
  web/          ← existing app
  design/       ← new Starlight design guide
    src/
      content/docs/
        tokens/
          colors.mdx
          typography.mdx
          spacing.mdx
          motion.mdx
        components/
          button.mdx
          badge.mdx
          card.mdx
          (etc.)
        patterns/
          filter-pipeline.mdx
          forms.mdx
          empty-states.mdx
        accessibility/
          overview.mdx
          color-contrast.mdx
          keyboard-navigation.mdx
        voice-tone/
          overview.mdx
          copy-guidelines.mdx
      styles/
        custom.css    ← imports tokens from apps/web/, maps to Starlight vars
      components/     ← React islands for live component demos
    astro.config.mjs
    package.json
```

### Token Reuse

No copy-paste. `apps/design/src/styles/custom.css` imports tokens directly:

```css
/* Import source of truth from apps/web */
@import '../../web/src/design-tokens/tokens.css';

/* Map app tokens → Starlight CSS variables */
:root {
  --sl-color-accent: var(--color-primary);
  --sl-color-accent-high: var(--color-primary-foreground);
  --sl-color-text: var(--color-foreground);
  --sl-color-bg: var(--color-background);
  --sl-font: var(--font-sans);
  /* (full mapping TBD during implementation) */
}
```

Token changes in `apps/web/` propagate to the design guide automatically on next build.

### Live Component Demos

Astro supports React "islands" — individual interactive components rendered inside MDX pages. Component demos in the design guide import real components from `apps/web/src/components/` directly (monorepo internal reference). No package extraction needed initially.

```mdx
---
title: Button
---

import { Button } from '../../../web/src/components/ui/button'

<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>
```

---

## Deployment

### Two Cloudflare Pages Projects

| Project | Source | Output dir | Subdomain |
|---------|--------|-----------|-----------|
| `p1i-design` | `apps/design/` | `apps/design/dist/` | `design.player1inventory.etblue.tw` |
| `p1i-storybook` | `apps/web/` | `apps/web/storybook-static/` | `storybook.player1inventory.etblue.tw` |

Both auto-deploy on push to `main` (Cloudflare Pages git integration).

### Build commands

```bash
# Design guide
cd apps/design && pnpm build

# Storybook
cd apps/web && pnpm build-storybook
```

### Verified build (2026-04-13)

- `pnpm build-storybook` completes successfully from `apps/web/`
- Output directory: `apps/web/storybook-static/` (confirmed)
- Output size: ~12 MB on disk (largest chunks: `iframe-BJTNGWnU.js` at 1.3 MB unminified, `DocsRenderer` at 744 kB — within Cloudflare Pages limits)
- Only warnings: Rollup chunk size advisory (chunks > 500 kB) — no errors

### DNS

Two CNAME records on `player1inventory.etblue.tw`:
- `design` → Cloudflare Pages project domain
- `storybook` → Cloudflare Pages project domain

---

## Content Sections (scaffold now, fill later)

| Section | Priority | Notes |
|---------|----------|-------|
| Tokens / Colors | High | OKLCH palette, semantic roles, dark mode |
| Tokens / Typography | High | Font, scale, line height |
| Tokens / Spacing | Medium | Scale reference |
| Tokens / Motion | Low | Transition tokens |
| Components / (all) | High | One page per component, live demo |
| Patterns / Filter pipeline | Medium | How the pantry/shopping filter system works |
| Patterns / Forms | Medium | Input patterns, validation UX |
| Patterns / Empty states | Low | |
| Accessibility / Overview | Medium | WCAG AA target, tools used |
| Accessibility / Color contrast | Medium | Token contrast ratios |
| Accessibility / Keyboard nav | Low | |
| Voice & Tone / Overview | Low | |
| Voice & Tone / Copy guidelines | Low | |

---

## Design Decisions

- **Starlight over Storybook-only:** Storybook's chrome is dev-centric; Starlight allows narrative prose alongside live demos, which is better for a public showcase.
- **Starlight over Docusaurus:** Built-in i18n support (including zh-TW) makes future multilingual expansion easy.
- **Two subdomains over one:** Keeps the polished public guide (`design.*`) separate from the developer tool (`storybook.*`). Each has a clear audience.
- **Direct CSS import over shared package:** Simpler for now; avoids premature abstraction. Can extract to `packages/tokens/` later if a third consumer appears.
- **English only initially:** i18n infrastructure in place (Starlight built-in); translation deferred until content is stable.
- **Scaffold now, fill later:** Getting the site live quickly validates the deployment pipeline; content can grow organically.

---

## Out of Scope

- Extracting a `packages/ui/` shared component library (future work if a third consumer appears)
- Translating content to zh-TW (deferred)
- Embedding Storybook in an iframe inside Starlight (cross-origin complexity; link instead)
- Custom Storybook theme to match the app (deferred)

---

## Related Docs

- `docs/global/design-system/2026-04-13-brainstorming-design-guide.md`
- `docs/global/design-system/2026-04-13-design-guide-implementation.md`
- `docs/global/design-system/2026-04-05-oklch-colors.md` (token reference)
