# Brainstorming Log — README v2

**Date:** 2026-04-03
**Branch:** docs/readme-rewrite
**Session:** README restructure for dual audience (product intro + portfolio)

---

## Goal

Improve README to serve two audiences simultaneously:
- **Normal users / open source developers** — product introduction
- **Hiring managers** — design portfolio (designer section) + technical depth (developer section)

Write as a genuine product introduction; design thinking emerges naturally, not stated explicitly.

---

## Decisions

### Overall structure (approved)

```
# Player 1 Inventory
tagline · hero · short intro paragraph

## Track / Shop / Cook       ← normal user (3 subsections, feature highlights + screenshots)
## Design Challenges         ← hiring manager (designer) — challenges encountered + how solved
## Under the Hood            ← hiring manager (developer) — technical highlights
## Stack                     ← one-liner
## Getting Started           ← dev server + MongoDB note
```

---

### Section 1 — Product (normal user)

Intro paragraph after hero: what the app is, who it's for, why it exists — absorbs the "for player, by player" origin naturally.

Three subsections matching tagline:

- **Track what you have** — pantry inventory, segmented progress bar, expiration tracking, flexible quantity updates. Screenshots: pantry list, pantry filter, item detail.
- **Shop what you need** — refill thresholds, vendor-aware shopping, household sharing. Screenshots: shopping page.
- **Cook what you can** — recipe-based batch deduction, cooking logs. Screenshots: cooking page.

---

### Section 2 — Design Challenges (designer hiring manager)

Framing: design challenges as portfolio evidence. Shows problem recognition, design thinking, and execution.

Format per challenge: challenge description → design decisions made → outcome.

#### Challenge 1: Complexity of real-life asset state transitions

Unlike game assets, real-life items have complex state transitions. Five states identified, each driving a distinct design decision:

**1. Out of stock / fully stocked**
- Pain: users have an implicit "enough" bar in their head; app needs to make it explicit to automate shopping list generation
- Decision: "target quantity" + "refill threshold" fields; low-stock items get distinct color in list view

**2. Bought from grocery, packed — variable package sizes**
- Pain: milk might be 2000ml or 1000ml; tracking by package count loses precision
- Decision: dual unit system — track by measurement unit (ml) for variable-size items; optional amountPerPackage converts between package and measurement

**3. Opened packages mixed with unopened**
- Pain: opened goods expire sooner than packed ones; user needs to see both states at once
- Decision: packed/unpacked dual quantity; segmented progress bar encodes both values simultaneously — segment length = packed quantity, second segment = unpacked quantity; color distinguishes the two states

**4. Partial consumption**
- Pain: milk consumed 200ml at a time, not possible to ask user to type arithmetic or press - button 200× per cup
- Decision: "amount per consumption" field — becomes step size for all ±buttons (pantry, cooking, recipe pages) and all keyboard up/down inputs (unpacked quantity, refill threshold fields in item form)

**5. Expired — explicit vs implicit due date**
- Pain: milk has a printed date; mushrooms don't; batteries never expire
- Decision: dual expiration mode — "specific date" (user sets it), "days from purchase" (app calculates from last purchase log), or "none"; warning threshold triggers visible red badge in list view to urge consumption

---

#### Challenge 2: Accessibility of color semantics across light and dark themes

Two sub-problems:

**Naming colors for correct usage**

Two color groups: low-saturation (general baseline) and colorful (highlights — buttons, badges, bars). Each must support 3 scenarios:
- Readable content (text/icon) — needs high contrast against containers for a11y
- Visual decorations (border/divider) — needs lower contrast to avoid visual noise
- Containers (page/block) — needs 2-3 elevated layers; inline containers (button/badge) don't need layering

Token naming convention:
- `*-foreground` for readable content, `*-accessory` for visual decorations, no keyword for containers
- `*-muted`, `*-emphasized`, `*-inverse` for variants
- `importance-*` / `status-*` for colorful semantics; `hue-*` for colorful non-semantics (tag type color options)

**A11y compliance across both themes**

HSL lightness values don't directly reflect perceptual luminance, making it hard to guarantee WCAG contrast ratios by inspection. Solution: OKLCH — colors in the same scenario are locked to the same L value (±5%) across light and dark mode, ensuring consistent perceptual luminance and sufficient contrast between foreground and container tokens.

---

#### Challenge 3: Bidirectionality of item and entity management

- Pain: an item can be purchased from multiple vendors, used in multiple recipes, and tagged with multiple tags — and vice versa. Users need to build these relationships from both directions: assign vendors/recipes/tags from an item's page, and assign items from a vendor/recipe/tag's page.
- Decision: flexible object creation from any perspective — users can create a tag/vendor/recipe while inside an item page, and create an item while inside a tag/vendor/recipe page. The official item creation entry point is the pantry page, but the search bar in each tag/vendor/recipe items tab doubles as a secondary creation path — so users building their item list from a categorization angle never need to navigate back to pantry just to add a new item.

---

#### Challenge 4: Practicality of pantry item categorization

- Pain: users need to browse inventory by category, but real-world items don't have fixed properties — classification axes multiply as civilization evolves (usage, composition, origin, biology, nutrition, preservation, drug interactions…). A fully MECE taxonomy is accurate but impractical for everyday pantry use.
- Decision: flexible tag system — users define tag types as classification axes (e.g. preservation method, hypermarket section), then nest tags under each type. No enforced taxonomy — users can be rigorous or casual. The onboarding template seeds 2 most practical tag types to give users a useful starting point without overwhelming them.

---

#### Challenge 5: Efforts of initial pantry setup

- Pain: to unlock stock tracking, shopping lists, expiration warnings, batch consumption, and categorization, users need to fill in a lot of data before any feature can serve them well. For a first-time user, the number of fields is overwhelming — especially before they understand what each field does or what benefit it brings.
- Decision: onboarding page with a curated template. Items and vendors are presented for users to pick from (high value, immediately understandable). Tags are shipped silently as pre-built metadata — useful but too abstract to ask a first-timer to configure. Recipes are skipped entirely — cooking is optional, and "general" recipes don't exist; a template would either be too narrow or too broad to be useful.

---

#### Challenge 6: Flexibility of cooking/consumption scenarios in real life

- Pain: simple household items (toilet paper, toothpaste) have straightforward consumption — just decrement. But fresh goods / ingredients are consumed together in varying combinations and amounts. A dish might skip a seasoning and still work; the same recipe might use more or less of an ingredient each time.
- Decision: recipe system — groups ingredients with a default consumption amount per ingredient. Optional/rarely-used ingredients can be set to 0 as default (user opts in per cooking session). In the cooking page, user can follow the defaults or adjust amounts per-session before confirming. The default amount is a starting point, not a contract.

---

### Section 3 — Under the Hood (developer hiring manager)

Topics worth mentioning (from brainstorming docs):

**Architecture:**
- Dual-mode architecture: offline-first (IndexedDB / Dexie.js) + cloud-optional (GraphQL / MongoDB / Clerk auth) — same component tree, same hooks, `enabled` flag switches data source
- Data-layer abstraction: components never touch DB directly; all data flows through TanStack Query hooks
- Monorepo: shared TypeScript types across frontend (`apps/web`) and backend (`apps/server`) via `packages/types`
- Auto-generated GraphQL types: `graphql-codegen` generates TypeScript types, operation types, and React Apollo hooks from the GraphQL schema — frontend always stays in sync with the backend schema; runs on dev server start and as part of the build

**Design system:**
- Semantic tokens defined directly in OKLCH — no primitive layer (raw palette), no separate primitive-to-semantic mapping step
- Thin domain alias layer on top (4 inventory state aliases: low-stock, expiring, in-stock, out-of-stock → mapped to semantic status tokens)
- OKLCH chosen for perceptual uniformity: L channel directly reflects perceived lightness, making WCAG AA compliance reasoning straightforward across both themes
- Dark/light theme: no flash on load (inline initialization script before React); system preference tracked; manual override persisted

**i18n:**
- react-i18next with EN + TW (Traditional Chinese) locales
- Parity test: automated test fails if any key exists in one locale but not the other

**Testing:**
- Unit + integration: Vitest + React Testing Library; "user can ..." naming with Given-When-Then comments
- Storybook smoke tests: every `.stories.tsx` has a `.stories.test.tsx` using `composeStories` — catches story regressions automatically
- E2E: Playwright covering all major pages; axe-playwright a11y scan on every branch

**Quality assurance:**
- Pre-commit hook (lint-staged): Biome format + lint on staged files before every commit
- Pre-push hook: TypeScript typecheck + lint + full test suite must pass before any push — AI-generated code goes through the same gates as human-written code
- AI-assisted development: subagent-driven workflow (fresh agent per task, two-stage spec + code quality review); design-first (brainstorming → design doc → implementation plan → execution)

---

## Open Questions

- [ ] Challenge 2 details (design token dual theme complexity) — user to provide
- [ ] Which specific screenshots pair with each challenge in the Design Challenges section?
- [ ] How much to expand the developer section — bullet list vs short paragraphs?
