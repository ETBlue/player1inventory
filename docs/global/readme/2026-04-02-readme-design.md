# Design Spec — README Rewrite

**Date:** 2026-04-02
**Branch:** docs/readme-rewrite
**Status:** Approved

---

## Goal

Rewrite the project README to serve as a portfolio piece for a Sr. UX Designer role application (Netskope, Taipei). The README is the only portfolio material — no live demo is deployed.

The README reads as a **product page**: the design speaks for itself, with the author implied. It does not read as a case study or a developer setup guide.

---

## Target Audience

UX hiring manager at a B2B enterprise software company. Specifically targeting the Netskope Sr. UX Designer JD, which emphasizes:
- Design process (wireframes → hi-fi mockups)
- Systems thinking ("big-picture thinking, able to make connections across systems")
- Solving complex problems with complex technology
- Design system work

---

## Structure

```
# Player 1 Inventory

[tagline]
[origin line]

[hero screenshot]

## Design Highlights
[6 bullets]

## Screenshots
### Onboarding
[4 screenshots]

### Pantry
[1 screenshot]

### Shopping
[1 screenshot]

### Cooking
[1 screenshot]

### Settings
[2 screenshots]

## Stack
[one-line tech list]

## Getting Started
[3-line code block]
```

---

## Section Content

### Title

```markdown
# Player 1 Inventory
```

### Tagline + Origin Line

```markdown
Track what you have. Shop what you need. Cook what you can.

The real-life companion to [Guild Wars 2 Inventory](https://github.com/ETBlue/gw2inventory) —
for player, by player.
```

**Rationale:**
- Tagline demonstrates UX writing ability and previews the 3-section app structure
- Origin line adds personality, signals genuine user empathy (built for self), and links to a pattern of building tools across two projects

### Hero Screenshot

File: `docs/screenshots/Player 1 Inventory 10-pantry.png`

The pantry list is the most information-rich screen: color-coded stock status, dual-unit quantities, expiry dates, tags, vendor/recipe counts, and the sort/filter toolbar — all visible at once. Shows the most UX craft in a single frame.

### Design Highlights

Six bullets naming deliberate design decisions (not feature descriptions):

1. **Segmented progress bar** — Visualizes packed vs. unpacked stock in a single bar, mirroring how a physical pantry actually works. Lets users read inventory state at a glance without opening individual items.

2. **Customizable stock thresholds + vendor-aware shopping** — Set personal refill thresholds per item, then filter the shopping list by store. Designed for household sharing: anyone can check what's needed on their way home without asking in real time.

3. **Expiration tracking with per-item deadlines** — Fresh produce has no printed date but a real shelf life. Track custom deadlines, surface expiring items first, sort by urgency — act before things spoil.

4. **Offline-first, cloud-optional** — Full functionality without internet, designed for use inside wholesale stores with poor cell coverage. Cloud sync is available for multi-device and family sharing; switching modes is seamless.

5. **Two quantity update paths** — Quick manual corrections (±buttons in pantry) for users updating stock while standing in front of the fridge. Recipe-based deduction in cooking mode for users who prefer group updates with a full activity log.

6. **Onboarding scaffold** — First-run setup includes a pre-built tag hierarchy and 20 common items + 19 vendors — useful immediately, not after hours of data entry.

**Intentionally excluded:** dark mode, i18n, accessibility, import/export — real work but polish/infrastructure, not core UX decisions.

### Screenshots (grouped by section)

Sections and files, in order:

**Onboarding** (4 screenshots):
- `Player 1 Inventory 00-welcome.png`
- `Player 1 Inventory 01-template.png`
- `Player 1 Inventory 02-template-items.png`
- `Player 1 Inventory 03-review.png`

**Pantry** (1 screenshot):
- `Player 1 Inventory 11-pantry-filter.png`

**Shopping** (1 screenshot):
- `Player 1 Inventory 21-shopping.png`

**Cooking** (1 screenshot):
- `Player 1 Inventory 31-cooking.png`

**Settings** (2 screenshots):
- `Player 1 Inventory 41-settings-local.png`
- `Player 1 Inventory 41-settings-cloud.png`

Note: `02-template-vendors.png` is excluded — the items and vendors template screens are visually similar; showing only items avoids redundancy.

Screenshot implementation: use HTML `<img>` tags with fixed width (e.g. `width="200"`) placed inline to render portrait mobile screenshots in a horizontal row per section. GitHub Markdown renders inline `<img>` tags.

### Stack

```markdown
React 19 · TypeScript · TanStack Router · TanStack Query · Dexie.js (IndexedDB)
Tailwind CSS v4 · shadcn/ui · Vitest · React Testing Library · Playwright
```

Concise list, no explanations. The tools speak for themselves. Two lines is fine for readability.

### Getting Started

```bash
pnpm install
pnpm dev
# open http://localhost:5173
```

Included to signal this is a real, runnable project. UX reviewers won't run it, but its presence adds credibility.

---

## Implementation Notes

- All screenshot files live in `docs/screenshots/`
- File names contain spaces — use HTML `<img>` tags rather than Markdown `![]()` syntax to avoid rendering issues
- The `02-template-vendors.png` screenshot is available but excluded from the README (redundant with items screen)
- The hero screenshot (pantry list) appears once at the top; `11-pantry-filter.png` appears in the Pantry section as the additional pantry screen
