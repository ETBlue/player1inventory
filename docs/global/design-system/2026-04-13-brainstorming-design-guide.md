# Brainstorming Log: Design Guide

**Date:** 2026-04-13
**Topic:** Building a public design guide and deploying it as a design showcase subdomain

---

## Questions & Answers

**Q: What should the design guide contain?**
A: Full design system docs — tokens, components, patterns, accessibility guidelines, voice & tone, usage guidelines.

**Q: Who is the primary audience?**
A: Anyone visiting the URL — a public showcase.

**Q: What technology?**
A: Considered Storybook alone, Starlight alone, Docusaurus, custom Vite+React. User asked about Starlight i18n support (confirmed: built-in, includes zh-TW). Final decision: **hybrid — Starlight (Astro) as outer shell + Storybook as dev tool**.

**Q: Does Starlight support i18n?**
A: Yes — built-in. Language switcher, fallback content, RTL support, community-translated UI strings including zh-TW. Confirmed this influenced the Starlight decision.

**Q: What are the cons of Storybook as a public showcase?**
A: Dev-centric UX, no free-form narrative prose, limited branding control, no full-text search. For component demos alone it's fine; for a full design system with narrative sections, Starlight is better.

**Q: Can tokens be reused instead of copy-pasted?**
A: Yes — `apps/design/` imports the token CSS file directly from `apps/web/src/design-tokens/`. A thin mapping layer maps app tokens → Starlight CSS variables. One source of truth, no drift.

**Q: Subdomain structure — one or two?**
A: Two subdomains:
- `design.player1inventory.etblue.tw` — Starlight (public design guide)
- `storybook.player1inventory.etblue.tw` — Storybook (component dev tool, also public)

**Q: Starlight branding depth?**
A: Full custom theme — override Starlight's CSS with the app's full design token set, imported directly from `apps/web/`.

**Q: Monorepo placement?**
A: `apps/design/` alongside `apps/web/`.

**Q: Content strategy?**
A: Scaffold structure now, fill content over time.

**Q: i18n for the design guide?**
A: English only for now. i18n support available if needed later.

**Q: Deployment?**
A: Cloudflare Pages — two separate CF Pages projects (one for Starlight, one for Storybook), both auto-deploy from `main`.

---

## Final Decision

**Hybrid: Starlight + Storybook**

- `apps/design/` — new Astro/Starlight app
- Full design system docs: tokens, components, patterns, a11y, voice & tone (scaffold now, fill later)
- Tokens imported directly from `apps/web/src/design-tokens/` — no copy-paste
- Full custom theme mapping app tokens → Starlight CSS variables
- Two Cloudflare Pages projects, two subdomains
- English only initially; i18n-ready by virtue of Starlight's built-in support
- Part of this monorepo, auto-deploys on push to `main`

**Rationale:** Starlight provides the narrative documentation structure that Storybook lacks, while Storybook remains the developer-facing component explorer. The two complement each other: Starlight links to Storybook for deep component inspection. Token reuse via direct CSS import keeps the design guide always in sync with the app.
