# Player 1 Inventory

Track what you have. Shop what you need. Cook what you can.

<img src="docs/screenshots/Player%201%20Inventory%2010-pantry.png" width="360" alt="Pantry" />

The real-life companion to [Guild Wars 2 Inventory](https://github.com/ETBlue/gw2inventory) —
for player, by player.

## Design Highlights

- **Segmented progress bar** — Visualizes packed vs. unpacked stock in a single bar, mirroring how a physical pantry actually works. Lets users read inventory state at a glance without opening individual items.

- **Customizable stock thresholds + vendor-aware shopping** — Set personal refill thresholds per item, then filter the shopping list by store. Designed for household sharing: anyone can check what's needed on their way home without asking in real time.

- **Expiration tracking with per-item deadlines** — Fresh produce has no printed date but a real shelf life. Track custom deadlines, surface expiring items first, sort by urgency — act before things spoil.

- **Offline-first, cloud-optional** — Full functionality without internet, designed for use inside wholesale stores with poor cell coverage. Cloud sync is available for multi-device and family sharing; switching modes is seamless.

- **Flexible quantity updates** — Update stock casually in the pantry for a quick correction before a shopping trip. Log purchases formally through the shopping page, or batch-deduct ingredients through the cooking page — recipes group items so recording a meal takes one action per dish, not one per ingredient.

- **Onboarding scaffold** — First-run setup includes a pre-built tag hierarchy and 20 common items + 19 vendors — useful immediately, not after hours of data entry.

## Screenshots

### Onboarding

<img src="docs/screenshots/Player%201%20Inventory%2000-welcome.png" width="180" alt="Welcome" />
<img src="docs/screenshots/Player%201%20Inventory%2001-template.png" width="180" alt="Template selection" />

<img src="docs/screenshots/Player%201%20Inventory%2002-template-items.png" width="180" alt="Template items" />
<img src="docs/screenshots/Player%201%20Inventory%2002-template-vendors.png" width="180" alt="Template vendors" />
<img src="docs/screenshots/Player%201%20Inventory%2003-review.png" width="180" alt="Review" />

### Pantry

<img src="docs/screenshots/Player%201%20Inventory%2010-pantry.png" width="180" alt="Pantry" />
<img src="docs/screenshots/Player%201%20Inventory%2011-pantry-filter.png" width="180" alt="Pantry with filters" />
<img src="docs/screenshots/Player%201%20Inventory%2050-item.png" width="180" alt="Item details" />

### Shopping & Cooking

<img src="docs/screenshots/Player%201%20Inventory%2021-shopping.png" width="180" alt="Shopping" />
<img src="docs/screenshots/Player%201%20Inventory%2031-cooking.png" width="180" alt="Cooking" />

### Settings

#### Data Mode

<img src="docs/screenshots/Player%201%20Inventory%2041-settings-local.png" width="180" alt="Settings — offline mode" />
<img src="docs/screenshots/Player%201%20Inventory%2041-settings-cloud.png" width="180" alt="Settings — cloud mode" />

#### Tags

<img src="docs/screenshots/Player%201%20Inventory%2060-tags.png" width="180" alt="Settings — tags" />
<img src="docs/screenshots/Player%201%20Inventory%2061-tag.png" width="180" alt="Settings — tag details" />
<img src="docs/screenshots/Player%201%20Inventory%2062-tag-items.png" width="180" alt="Settings — tag items" />

#### Vendors

<img src="docs/screenshots/Player%201%20Inventory%2070-vendors.png" width="180" alt="Settings — vendors" />
<img src="docs/screenshots/Player%201%20Inventory%2071-vendor.png" width="180" alt="Settings — vendor" />
<img src="docs/screenshots/Player%201%20Inventory%2072-vendor-items.png" width="180" alt="Settings — vendor items" />

#### Recipes

<img src="docs/screenshots/Player%201%20Inventory%2080-recipes.png" width="180" alt="Settings — recipes" />
<img src="docs/screenshots/Player%201%20Inventory%2081-recipe.png" width="180" alt="Settings — recipe" />
<img src="docs/screenshots/Player%201%20Inventory%2082-recipe-items.png" width="180" alt="Settings — recipe items" />

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
