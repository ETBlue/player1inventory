### Tabbed Item Form

Item detail pages use a tabbed layout with three sections:

**1. Stock Status (default tab, `/items/$id`)**
- Quantity fields for packed and unpacked stock
- Unpacked quantity field always enabled (supports fractional packages)
- Expiration date field (date value, not mode/threshold)
- Save button disabled when no changes made

**2. Item Info (same route, `/items/$id`)**
- Item name and package unit configuration
- Target quantity and refill threshold
- Consumption amount settings
- Expiration mode (specific date or days from purchase) and warning threshold

**3. Tags (`/items/$id/tags`)**
- Tag assignment interface with uppercase text styling for tag type names
- Click badges to toggle tag assignment (selected tags show X icon)
- Visual dividers between tag type sections
- Inline tag creation via "New Tag" buttons (opens `AddNameDialog`)
- Changes apply immediately without save button

**4. Vendors (`/items/$id/vendors`)**
- Vendor assignment interface: click-to-toggle badges, immediate save
- "New Vendor" button inline with badges — opens `AddNameDialog`, creates and immediately assigns the vendor
- Changes apply immediately without save button

**5. Recipes (`/items/$id/recipes`)**
- Recipe assignment interface: click-to-toggle badges, immediate save
- Architecture: recipe-centric — `Recipe.items[]` stores the relationship; toggling updates the recipe, not the item
- "New Recipe" button inline with badges — opens `AddNameDialog`, creates recipe assigned to this item
- Changes apply immediately without save button

**Measurement Tracking Behavior:**

The "Track in measurement" switch controls measurement-based quantity tracking:
- **Switch always enabled** - Users can toggle freely between package/measurement modes
- **When OFF** (package mode):
  - Measurement fields (unit, amount per package) are disabled
  - All quantities tracked in package units
- **When ON** (measurement mode):
  - Measurement fields become enabled and required
  - Form cannot be submitted until both fields filled
  - Quantities automatically convert between units when toggling

**Unit Conversion:**

When toggling between package/measurement modes, these fields auto-convert:
- Unpacked quantity
- Target quantity
- Refill threshold
- Amount per consume

Conversion uses the `amountPerPackage` value (e.g., 500g per pack).

**Dirty State Tracking:**

Each tab tracks unsaved changes independently:
- Navigation guard prevents tab switching with unsaved changes
- Confirmation dialog offers "Discard" or "Cancel" options
- Save button disabled when form is clean (no changes)
- Logs tab never has unsaved changes (view-only)

**Navigation:**

Back button and post-action navigation use smart history tracking:
- Back button navigates to previous app page (fallback to home if no history)
- After successful save: auto-navigate back
- After successful delete: auto-navigate back
- Back button respects dirty state guard (shows discard dialog if unsaved changes)

Uses `useAppNavigation()` hook from `src/hooks/useAppNavigation.ts`.

**Files:**
- `src/components/item/ItemForm/index.tsx` - Shared form component used by both edit and new item routes
- `src/routes/items/$id.tsx` - Parent layout with tabs and navigation guard
- `src/routes/items/$id/index.tsx` - Stock Status + Item Info form (uses ItemForm with all sections)
- `src/routes/items/$id/tags.tsx` - Tags tab implementation
- `src/routes/items/$id/vendors.tsx` - Vendors tab implementation
- `src/routes/items/$id/vendors.test.tsx` - Vendors tab tests
- `src/routes/items/$id/recipes.tsx` - Recipes tab implementation
- `src/routes/items/$id/recipes.test.tsx` - Recipes tab tests
- `src/routes/items/$id.log.tsx` - History/logs tab (view-only)
- `src/routes/items/$id.test.tsx` - Integration tests
- `src/routes/items/new.tsx` - New item form (uses ItemForm with info + advanced sections)
- `src/hooks/useItemLayout.tsx` - Dirty state context for tab coordination

### Manual Quantity Input

Users can manually set current inventory quantities in the item detail form:
- **Packed Quantity** - Number of whole packages (always visible)
- **Unpacked Quantity** - Loose amount from opened packages (only for dual-unit items)
- **Pack unpacked button** - Manually converts complete units from unpacked to packed

**+/- Button Behavior (Pantry Page):**
- Both + and - buttons always operate on unpacked quantity
- No automatic normalization/packing
- Use "Pack unpacked" button in item detail form to manually pack complete units

**Location:** Item detail page (`/items/$id`) via ItemForm component

**Behavior:**
- Pre-populates with current `item.packedQuantity` and `item.unpackedQuantity`
- Validates non-negative values
- Warns when unpacked ≥ amountPerPackage
- Saves directly to database without creating inventory log entries
- Use for initial setup, corrections, or adjustments

**Files:**
- `src/routes/items/$id/index.tsx` - Item detail form with quantity fields
- `src/routes/items/$id.test.tsx` - Component tests
- `src/lib/quantityUtils.ts` - packUnpacked() function
