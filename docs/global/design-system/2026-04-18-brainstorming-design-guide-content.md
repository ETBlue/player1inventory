# Brainstorming: Design Guide Content

**Date:** 2026-04-18
**Context:** Planning the content for `apps/design/` (Starlight site at `design.player1inventory.etblue.tw`). The technical scaffold was built in PR #183. This session defines what goes in each of the 24 pages.

---

## Phase 1 — Principles

**Q: What is the primary user doing when they open the app?**
Tracking items and planning shopping.

**Q: Have you ever had a design disagreement where you thought "we need a rule for this"?**
Yes — recurring tensions include:
- Should the progress bar be continuous for items tracked in measurement?
- Does anyone actually need the dual unit feature?
- Why not build a chatbot instead? Is GUI-based web app still useful in the AI era?
- Are the complex form fields in item details actually helpful, or confusing?
- Does the app really make things easier than Google Tasks, given all the metadata to configure?
- Is the cooking page actually useful? It's troublesome to click around daily after finishing kitchen work.

**Q: What should the UI feel like?**
Warm, as casual as you are at home, efficient and neat.

**Follow-up: Is structured GUI still the right call in the AI era?**
Yes — for stock tracking and shopping, users need a stable list view to edit against. Clicking +/- buttons for quantity updates and checking checkboxes when grabbing items into cart is much faster than describing actions in natural language to an LLM.

**Follow-up: Keep or simplify the complex forms?**
Keep the form, but move complex fields to an advanced section, disabled by default — reveal complexity progressively. This is why the onboarding template was built.

### Resulting principles

| # | Principle | Rationale |
|---|---|---|
| 1 | **Structure earns its keep** | GUI beats conversation when users need a stable view to edit against — checkboxes and +/- are faster than sentences |
| 2 | **Progressive disclosure** | Keep the form, but start minimal. Complexity is opt-in, not the default. The onboarding template is the proof of concept. |
| 3 | **Earn every field** | Each input must justify its cognitive cost. If it doesn't make tracking or shopping easier, it doesn't belong in the default view. |
| 4 | **Home-worthy** | The UI should feel as comfortable and unpretentious as someone's own kitchen — warm, casual, efficient, neat. Not a spreadsheet. |

---

## Phase 2 — Tokens

**Q: Are spacing tokens defined as CSS variables?**
No — spacing is done with Tailwind classes. The approach is to do as little customization as possible to keep the codebase clean. Tailwind's built-in scale is good enough.

**Q: Border radius and shadows — CSS tokens or Tailwind utilities?**
Tailwind utilities.

**Implication:** The spacing and effects token pages will document *Tailwind conventions* (which classes to use, when) rather than CSS variable references.

**Q: Does the app have animations, or is motion entirely forward-looking?**
CSS transitions are in use. These count — the motion page documents them.

**Q: Do both light and dark modes work fully?**
Yes — both modes are fully functional, with design tokens set for both themes.

---

## Phase 3 — Components

**Q: Which components exist in the app?**
All components live in `apps/web/src/components/ui/`. Current inventory (14 components):

- alert-dialog
- badge
- button
- card
- checkbox
- dialog
- dropdown-menu
- input
- label
- progress
- radio-group
- select
- sonner (toast)
- switch

**Q: Should component pages link to Storybook?**
Yes — each component page should include a "View in Storybook →" link.

---

## Phase 4 — Patterns

**Q: Inline or submit-time validation?**
Inline validation + disable submit button while invalid.

**Q: What does the filter pipeline look like?**
Items can be:
- Filtered by tags / recipes / vendors
- Searched by keyword
- Grouped by shelf

**Q: Which interaction patterns feel inconsistent today?**
Many — these directly define what the pattern pages need to resolve:
1. Search (and create) behavior
2. Delete button position for objects
3. Empty state layout for lists
4. Layout for object detail pages
5. Back behavior — unsaved changes dialog, location history management on tab switch
6. Object cards in settings
7. Top bar visuals for object detail pages
8. Background elevation level for different pages / object detail pages
9. Behaviors on tag/vendor/recipe badge click across different views
10. Differentiation between badges with user-selected colors (tags) vs. system colors (vendor/recipe)
11. Differentiation between object list / object details for different object types (item/tag/vendor/recipe/shelf)

### Resulting additional pattern pages

| New page | Covers from above |
|---|---|
| `patterns/object-detail.mdx` | Top bar (#7), elevation (#8), back behavior (#5), unsaved changes, tab switching |
| `patterns/search-and-create.mdx` | Search + create from search results (#1) |
| `patterns/object-cards.mdx` | Settings cards (#6), delete button position (#2) |

The badge component page also needs a dedicated section on:
- User-color badges (tags) vs. system-color badges (vendor/recipe) — #10
- Badge click behavior rules across views — #9

---

## Phase 5 — Accessibility

**Q: Target WCAG level?**
AA (standard).

**Q: Should the color contrast page document known failures?**
No — document the rules only, covering all possible foreground/background combinations for text and non-text content. Known failures from the pre-existing light-mode issue are not in scope here.

---

## Phase 6 — Voice & Tone

**Q: How should the app sound?**
With more personality — a typical ETBlue style.

**Q: Are there existing UI strings that exemplify the tone?**
Yes — `apps/web/src/i18n/locales/tw.json`. Key examples:

| String | What it signals |
|---|---|
| `先不用` ("not yet" for cancel/back) | Casual, non-committal — avoids confrontation |
| `剛剛的不算` ("that doesn't count" for undo) | Playful, conversational |
| `可以安心刪除` ("safe to delete") | Reassuring, like a knowledgeable friend |
| `移動標籤失敗了...` (with ellipsis) | Honest about failure, with a slight sigh |
| `趕快來打造你的儲藏室吧` ("go build your pantry!") | Warm encouragement, active voice |
| `～在現實世界也要追求極致的庫存管理～` (onboarding subtitle) | Game-adjacent, self-aware humor |

**Voice characterization:** Casual, warm, gently encouraging, honest about errors without over-apologizing, occasionally playful. Feels like a knowledgeable friend who takes the *task* seriously but doesn't take themselves too seriously.

---

## Phase 7 — Governance

**Q: Solo project or team?**
Solo project.

**Q: Is the CSS token naming intentional or ad-hoc?**
The naming has evolved over several versions and settled into the current structure (`--group-role-modifier`, e.g. `--importance-primary`, `--background-base`). It's intentional but could still be improved. The governance page will document the naming convention and flag tokens that don't yet follow the pattern.

---

## Final page count

**24 pages total** (up from 21 in the initial plan — 3 new pattern pages added based on L):

| Section | Pages |
|---|---|
| Principles | 1 (new) |
| Tokens | 7 (4 existing + 3 new: effects, theming, layout) |
| Components | 3 (existing) |
| Patterns | 8 (3 existing + 2 from initial plan + 3 new: object-detail, search-and-create, object-cards) |
| Accessibility | 3 (existing) |
| Voice & Tone | 2 (existing) |
| Governance | 1 (new) |

See `2026-04-14-design-guide-content.md` for the full page-by-page content spec (to be updated with the 3 new pattern pages).
