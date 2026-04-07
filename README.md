# Player 1 Inventory

Track what you have. Shop what you need. Cook what you can.

<img src="docs/screenshots/Player%201%20Inventory%2010-pantry.png" width="360" alt="Pantry" />

Player 1 Inventory is a household pantry management app — track stock levels, build shopping lists, and log ingredient use when cooking. Built for real-life pantry coordination: offline-first for use in stores, cloud-optional for family sharing.

## Track / Shop / Cook

### Track what you have

Every item tracks packed and unpacked quantities separately — opened packages and untouched ones are different states that matter for consumption order. A segmented progress bar shows both at a glance, color-coded by stock status (in stock / low / out of stock).

Items with variable package sizes (e.g. milk in 1000ml or 2000ml cartons) can be tracked in measurement units instead of package counts. Expiration is configurable per item: set a fixed due date, or let the app calculate it from the last purchase date.

<img src="docs/screenshots/Player%201%20Inventory%2011-pantry-filter.png" width="300" alt="Pantry with filters" />

### Shop what you need

Each item has a configurable refill threshold — the app knows when stock is low enough to add it to the shopping list automatically. The shopping list can be filtered by vendor so each household member sees only what to pick up at their store.

No coordination needed: anyone can check what's needed on their way home without asking in real time.

<img src="docs/screenshots/Player%201%20Inventory%2021-shopping.png" width="300" alt="Shopping" />

### Cook what you can

Recipes group ingredients with default consumption amounts. When cooking, the app pre-fills quantities based on the recipe — follow them or adjust on the fly. Items with `defaultAmount = 0` are optional ingredients that start unchecked.

Cooking a recipe deducts all ingredients in one step, with the option to set the number of servings and override individual amounts before confirming.

<img src="docs/screenshots/Player%201%20Inventory%2031-cooking.png" width="300" alt="Cooking" />

## Design Challenges

Building a pantry app sounds simple. It isn't. Real-life household goods have complex state transitions, flexible categorization needs, and overlapping relationships that game inventory systems don't need to handle. These are the design challenges I encountered — and the decisions I made to address them.

The app is named Player 1 Inventory as a real-life counterpart to [Guild Wars 2 Inventory](https://github.com/ETBlue/gw2inventory), a game inventory tool I built earlier. Both are about tracking assets you own. The difference is that real-life assets are messier.

### Challenge 1: Complexity of real-life asset state transitions

A pantry item isn't just "in stock" or "out of stock." It moves through multiple states that each require different design decisions.

**Stocking threshold** — users carry an implicit sense of "enough" in their heads. Making it explicit (target quantity + refill threshold) lets the app generate the shopping list automatically. Low-stock items get a distinct color in the list view.

**Variable package sizes** — milk might come in 1000ml or 2000ml cartons. Tracking by package count loses precision when sizes vary. A dual unit system (package + measurement) lets users track in whichever unit makes sense.

**Packed vs. unpacked** — opened goods expire sooner than sealed ones; users need to track both at once. Packed and unpacked quantities are stored separately. The segmented progress bar encodes both states in a single visual: one segment for packed, one for unpacked.

**Partial consumption** — consuming 200ml of milk shouldn't require typing arithmetic or pressing minus 200 times. A configurable "amount per consumption" field becomes the step size for all ±buttons across the pantry, cooking, and recipe pages.

**Expiration** — some items have printed dates (milk), others don't (mushrooms), others never expire (batteries). Two expiration modes: set a fixed due date, or set a number of days and let the app calculate from the last purchase. A warning threshold triggers a visible badge when an item is nearing expiry.

<img src="docs/screenshots/Player%201%20Inventory%2050-item.png" width="300" alt="Item details" />

### Challenge 2: Accessibility of color semantics across light and dark themes

The app needs to express multiple color meanings — stock status, importance levels, tag categories — across both light and dark themes, while meeting WCAG AA contrast requirements in both modes.

The token system uses two groups: low-saturation colors for baseline UI (backgrounds, text, borders) and colorful ones for highlights (buttons, badges, status bars). Each group covers three scenarios — readable content (text/icon), visual decoration (border/divider), and containers (page/card/button) — with naming conventions that encode the scenario: `*-foreground` for text, `*-accessory` for decorations, no suffix for containers.

HSL lightness values don't reflect perceptual luminance, making WCAG compliance hard to reason about by inspection. All tokens are defined in OKLCH, where the L channel directly represents perceived lightness. Colors in the same usage scenario are locked to the same L value (±5%) across both themes, so contrast ratios are guaranteed without manual checking.

<img src="docs/screenshots/Player%201%20Inventory%2041-settings-local.png" width="300" alt="Settings — offline mode" />

### Challenge 3: Bidirectionality of item and entity management

Items, tags, vendors, and recipes are connected in a many-to-many structure. A user building their item list from a vendor perspective shouldn't have to navigate back to the pantry just to create a new item.

Object creation works in both directions: from an item's page, users can create tags, vendors, or recipes inline. From a tag, vendor, or recipe's items tab, the search bar doubles as a creation path — typing a name that doesn't match any item reveals a "+ Create" row. The primary item creation entry point remains the pantry page, but the secondary path removes a navigation round-trip when working from a categorization angle.

<img src="docs/screenshots/Player%201%20Inventory%2062-tag-items.png" width="300" alt="Settings — tag items" />

### Challenge 4: Practicality of pantry item categorization

Real-world items can be classified along many axes — preservation method, nutritional category, place of origin, intended use, and more. A fully exhaustive, MECE taxonomy is accurate but impractical for daily pantry use.

The tag system lets users define their own classification axes (tag types) and nest tags within them. There's no enforced structure — users can be as rigorous or as casual as they want. The onboarding template seeds two common tag types (preservation method and hypermarket section) as a practical starting point, without requiring users to design a taxonomy before they can use the app.

<img src="docs/screenshots/Player%201%20Inventory%2060-tags.png" width="300" alt="Settings — tags" />

### Challenge 5: Efforts of initial pantry setup

Useful pantry tracking requires a lot of initial data: item names, package units, quantities, refill thresholds, tags, vendors. For a first-time user, this is overwhelming — especially before they understand what each field does or what benefit it brings.

The onboarding page offers a curated template: 20 common pantry items and 19 vendors to pick from. Tags are shipped silently as pre-configured metadata — useful, but too abstract to ask a first-timer to set up. Recipes are omitted entirely: cooking is optional, and "general" recipes don't exist at a household level; a template would be either too narrow or too broad to be useful.

<img src="docs/screenshots/Player%201%20Inventory%2002-template-items.png" width="300" alt="Template items" />

### Challenge 6: Flexibility of cooking/consumption scenarios in real life

Simple household items (toilet paper, toothpaste) have straightforward consumption — just decrement. Ingredients are different: multiple items are consumed together in varying combinations, and the same dish might use more or less of an ingredient each time, or skip one entirely.

The recipe system groups ingredients with a default consumption amount per item. Optional or rarely-used ingredients can be set to 0 as their default (the user opts them in per cooking session). In the cooking page, users can follow the defaults or adjust amounts per-session before confirming. Recipes are a starting point, not a contract.

<img src="docs/screenshots/Player%201%20Inventory%2081-recipe.png" width="300" alt="Settings — recipe" />

## Under the Hood

**Architecture**
- Offline-first with IndexedDB (Dexie.js) + optional GraphQL backend (MongoDB, Apollo, Clerk auth) — same component tree and hooks in both modes; an `enabled` flag switches the active data source
- Components never access the database directly — all data flows through TanStack Query hooks
- Monorepo (`apps/web` + `apps/server` + `packages/types`) with shared TypeScript types across frontend and backend
- Auto-generated GraphQL types and React Apollo hooks via `graphql-codegen` — frontend stays in sync with the schema automatically

**Design system**
- Semantic color tokens defined directly in OKLCH — no separate primitive layer; thin domain alias layer for inventory states (low-stock, expiring, in-stock, out-of-stock)
- Two-level token naming: scenario (`foreground` / `accessory` / container) × semantic group (`importance-*` / `status-*` / `hue-*`)
- Dark/light/system theme with no flash on load (inline init script before React); system preference tracked; manual override persisted in localStorage

**Internationalization**
- react-i18next with EN and Traditional Chinese (TW) locales
- Automated parity test: fails if any key exists in one locale but not the other

**Testing**
- Unit + integration: Vitest + React Testing Library; "user can …" naming with Given-When-Then comments
- Storybook smoke tests: every `.stories.tsx` has a `.stories.test.tsx` using `composeStories` — catches story regressions without manual review
- E2E: Playwright covering all major pages and flows; axe-playwright WCAG AA accessibility scan on every branch

**Quality assurance**
- Pre-commit hook (lint-staged): Biome format + lint on staged files before every commit
- Pre-push hook: TypeScript typecheck + lint + full test suite — AI-generated code goes through the same gates as human-written code
- AI-assisted development: subagent-driven workflow (fresh agent per task, spec + code quality review gates); design-first process (brainstorming → design doc → implementation plan → execution)

## Stack

React 19 · TypeScript · TanStack Router · TanStack Query · Dexie.js (IndexedDB)  
Tailwind CSS v4 · shadcn/ui · Vitest · React Testing Library · Playwright

## Getting Started

```bash
pnpm install
pnpm dev
# open http://localhost:5173
# cloud sync requires MongoDB + Clerk — see apps/server/.env.example
```
