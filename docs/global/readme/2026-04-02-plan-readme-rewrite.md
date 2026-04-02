# README Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the near-empty README.md with a portfolio-quality product page targeting a Sr. UX Designer hiring manager.

**Architecture:** Single file edit — `README.md` in the project root. No code changes. HTML `<img>` tags (not Markdown image syntax) are required because screenshot filenames contain spaces, which Markdown `![]()` syntax does not handle reliably on GitHub.

**Tech Stack:** Markdown + inline HTML `<img>` tags, screenshots at `docs/screenshots/`

---

## Task 1: Write README.md

**Files:**
- Modify: `README.md` (project root)

- [ ] **Step 1: Replace README.md with the following content**

Replace the entire file content with:

```markdown
# Player 1 Inventory

Track what you have. Shop what you need. Cook what you can.

The real-life companion to [Guild Wars 2 Inventory](https://github.com/ETBlue/gw2inventory) —
for player, by player.

<img src="docs/screenshots/Player%201%20Inventory%2010-pantry.png" width="300" alt="Pantry" />

## Design Highlights

- **Segmented progress bar** — Visualizes packed vs. unpacked stock in a single bar, mirroring how a physical pantry actually works. Lets users read inventory state at a glance without opening individual items.

- **Customizable stock thresholds + vendor-aware shopping** — Set personal refill thresholds per item, then filter the shopping list by store. Designed for household sharing: anyone can check what's needed on their way home without asking in real time.

- **Expiration tracking with per-item deadlines** — Fresh produce has no printed date but a real shelf life. Track custom deadlines, surface expiring items first, sort by urgency — act before things spoil.

- **Offline-first, cloud-optional** — Full functionality without internet, designed for use inside wholesale stores with poor cell coverage. Cloud sync is available for multi-device and family sharing; switching modes is seamless.

- **Two quantity update paths** — Quick manual corrections (±buttons in pantry) for users updating stock while standing in front of the fridge. Recipe-based deduction in cooking mode for users who prefer group updates with a full activity log.

- **Onboarding scaffold** — First-run setup includes a pre-built tag hierarchy and 20 common items + 19 vendors — useful immediately, not after hours of data entry.

## Screenshots

### Onboarding

<img src="docs/screenshots/Player%201%20Inventory%2000-welcome.png" width="180" alt="Welcome" />
<img src="docs/screenshots/Player%201%20Inventory%2001-template.png" width="180" alt="Template selection" />
<img src="docs/screenshots/Player%201%20Inventory%2002-template-items.png" width="180" alt="Template items" />
<img src="docs/screenshots/Player%201%20Inventory%2003-review.png" width="180" alt="Review" />

### Pantry

<img src="docs/screenshots/Player%201%20Inventory%2011-pantry-filter.png" width="180" alt="Pantry with filters" />

### Shopping

<img src="docs/screenshots/Player%201%20Inventory%2021-shopping.png" width="180" alt="Shopping" />

### Cooking

<img src="docs/screenshots/Player%201%20Inventory%2031-cooking.png" width="180" alt="Cooking" />

### Settings

<img src="docs/screenshots/Player%201%20Inventory%2041-settings-local.png" width="180" alt="Settings — offline mode" />
<img src="docs/screenshots/Player%201%20Inventory%2041-settings-cloud.png" width="180" alt="Settings — cloud mode" />

## Stack

React 19 · TypeScript · TanStack Router · TanStack Query · Dexie.js (IndexedDB)  
Tailwind CSS v4 · shadcn/ui · Vitest · React Testing Library · Playwright

## Getting Started

\`\`\`bash
pnpm install
pnpm dev
# open http://localhost:5173
\`\`\`
```

- [ ] **Step 2: Verify the file**

```bash
cat README.md
```

Expected: file starts with `# Player 1 Inventory`, contains `## Design Highlights` with 6 bullets, `## Screenshots` with 5 subsections, `## Stack`, `## Getting Started`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite as portfolio product page

Track what you have. Shop what you need. Cook what you can.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
