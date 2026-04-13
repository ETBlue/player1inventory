# Implementation Plan: Design Guide

**Date:** 2026-04-13
**Branch:** `feature/design-guide`
**Design doc:** `2026-04-13-design-guide.md`

---

## Phase 1 — Scaffold `apps/design/` Starlight app

**Goal:** A working Astro/Starlight site that builds and runs locally.

### Steps

1. **Bootstrap Starlight app**
   ```bash
   cd apps && pnpm create astro@latest design -- --template starlight --no-install
   cd design && pnpm install
   ```

2. **Configure `astro.config.mjs`**
   - Set site title: "Player 1 Inventory — Design Guide"
   - Set `base` if needed for Cloudflare Pages
   - Enable React integration (`@astrojs/react`) for component islands
   - Configure sidebar structure matching the content sections in the design doc

3. **Add to monorepo**
   - Add `apps/design` to `pnpm-workspace.yaml`
   - Add `design` script to root `package.json` if needed

4. **Create content scaffold**
   - Create all `.mdx` files listed in design doc with placeholder headings and `TODO` body text
   - Sections: `tokens/`, `components/`, `patterns/`, `accessibility/`, `voice-tone/`

5. **Verify local build**
   ```bash
   cd apps/design && pnpm dev     # dev server
   cd apps/design && pnpm build   # static build
   ```

**Verification gate:**
```bash
(cd apps/design && pnpm build)
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Phase 2 — Token import and custom theme

**Goal:** The Starlight site uses the app's own design tokens — colors, typography, spacing — with no copy-paste.

### Steps

1. **Create `apps/design/src/styles/custom.css`**
   - `@import` the token file from `apps/web/src/design-tokens/tokens.css`
   - Map app CSS variables → Starlight CSS variables (full mapping)
   - Test both light and dark mode

2. **Apply custom CSS in `astro.config.mjs`**
   ```js
   starlight({
     customCss: ['./src/styles/custom.css'],
   })
   ```

3. **Verify visual parity**
   - Colors, font, and spacing match the main app
   - Dark mode toggle works correctly

**Verification gate:** same as Phase 1.

---

## Phase 3 — Live component demos (React islands)

**Goal:** MDX pages can embed real, interactive components from `apps/web/`.

### Steps

1. **Configure `@astrojs/react`** in `astro.config.mjs`

2. **Configure path alias** in `astro.config.mjs` so MDX pages can import from `apps/web/src/`:
   ```js
   vite: {
     resolve: {
       alias: {
         '@web': path.resolve('../web/src'),
       },
     },
   }
   ```

3. **Add demo components**
   - Create `apps/design/src/components/` for any demo wrapper components needed
   - Write demo for `Button` component as proof of concept

4. **Update `tokens/colors.mdx`** — embed a live color swatch demo using real token values

5. **Verify islands work** — interactive demos render and respond to user input

**Verification gate:** same as Phase 1.

---

## Phase 4 — Storybook deployment config

**Goal:** Storybook builds and is ready to deploy from `apps/web/`.

### Steps

1. **Verify `pnpm build-storybook` completes cleanly** from `apps/web/`
   - Output: `apps/web/storybook-static/`

2. **Add a `storybook:build` root script** (or confirm existing `build-storybook` is sufficient)

3. **Document the Cloudflare Pages build settings** for the `p1i-storybook` project:
   - Build command: `cd apps/web && pnpm build-storybook`
   - Output directory: `apps/web/storybook-static`
   - Root directory: repo root

**Verification gate:**
```bash
(cd apps/web && pnpm build-storybook) 2>&1 | tail -5
```

---

## Phase 5 — Cloudflare Pages deployment

**Goal:** Both sites auto-deploy from `main` to their subdomains.

### Steps

1. **Create Cloudflare Pages project: `p1i-design`**
   - Connect to GitHub repo
   - Build command: `cd apps/design && pnpm build`
   - Output directory: `apps/design/dist`
   - Node version env var if needed

2. **Create Cloudflare Pages project: `p1i-storybook`**
   - Connect to GitHub repo
   - Build command: `cd apps/web && pnpm build-storybook`
   - Output directory: `apps/web/storybook-static`

3. **Configure DNS** on `player1inventory.etblue.tw`
   - Add CNAME `design` → `p1i-design.pages.dev`
   - Add CNAME `storybook` → `p1i-storybook.pages.dev`
   - Enable custom domain in each CF Pages project

4. **Verify both URLs resolve and serve correct content**

---

## Phase 6 — Cross-linking and polish

**Goal:** The two sites link to each other; basic content is in place for the scaffold pages.

### Steps

1. **Add "View in Storybook" link** in Starlight component pages → deep link to the corresponding Storybook story

2. **Add "Design Guide" link** in Storybook (if possible via Storybook toolbar/manager) → `design.player1inventory.etblue.tw`

3. **Write initial content** for highest-priority pages:
   - `tokens/colors.mdx` — color token reference with live swatches
   - `tokens/typography.mdx` — font scale reference

4. **Update `docs/INDEX.md`** — add `design-guide` row with status ✅

5. **Final E2E check** — visit both deployed URLs and verify pages load correctly

---

## Out of Scope (deferred)

- zh-TW translations
- Iframe-embedding Storybook inside Starlight
- Custom Storybook theme
- Extracting `packages/tokens/` shared package
- Filling all placeholder content pages

---

## Notes

- Phases 1–3 are frontend work (new Astro app); they can be done in any order relative to Phase 4.
- Phase 5 requires Cloudflare dashboard access — may need manual steps by the user.
- Phase 6 depends on Phases 4 and 5 being complete.
