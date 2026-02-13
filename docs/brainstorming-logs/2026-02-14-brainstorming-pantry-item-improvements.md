# Brainstorming: Pantry Item Improvements

**Date:** 2026-02-14

## Initial Request

Improve pantry item related UI with the following features:

1. **Dual-unit system** - Package unit (bottle, pack) + measurement unit (L, ml, cups)
2. **Packed/unpacked quantities** - Track whole packages separately from partial amounts
3. **Progress bar enhancements** - Show partial fills for unpacked portions in segmented bar
4. **Flexible expiration modes** - Explicit date, days until expiration, or empty
5. **Smart expiration badge** - Clear date when quantity = 0, don't show badge for empty items
6. **Inactive items** - Items with target=0 and current=0, collapsed by default

## Questions and Answers

---

### Q1: Target Quantity Flexibility

**How should the target quantity work with dual units?**

Options:
1. Target = number of packages (e.g., "2 bottles") - unpacked counts as partial progress
2. Target = total measurement (e.g., "2L") - bottles convert to measurement
3. Flexible - user chooses whether target is in packages or measurement

**A:** Option 3 - Flexible (user chooses tracking unit)

---

### Q2: Specifying Target Unit

**When both package and measurement units defined, how do users specify target unit?**

Options:
1. Explicit toggle - Radio buttons: "Track in bottles" vs "Track in liters"
2. Infer from input - Whole number = packages, decimal = measurement
3. Dual fields - Separate inputs for both, user fills one

**A:** Option 1 - Explicit toggle (clearest)

---

### Q3: Displaying Unpacked Portions

**When tracking in packages, how should unpacked portions be displayed?**

Example: Target = 2 bottles, Current = 1 bottle + 700ml

Options:
1. Show both explicitly - "1 bottle + 700ml" or "1.7 bottles"
2. Convert to decimal - Always "1.7 bottles" (if 1L per bottle)
3. Show packed count + partial indicator - "1 bottle" with progress bar

**A:** Option 1 - Show both explicitly (maximum clarity)

---

### Q4: Progress Bar Partial Segments

**How should partial packages render in segmented progress bar?**

Example: Target = 2, Current = 1 full + 70% of second

Options:
1. First segment full, second segment 70% filled - Each segment = one target unit
2. 1.7 segments filled - Literal visual representation
3. Visual gradient within segment - Gradient/partial fill effect

**A:** Option 1 - Each segment represents target unit, filled proportionally

---

### Q5: Inactive Items Display

**How should inactive items (target=0, current=0) be displayed?**

Options:
1. Separate collapsible section - "Inactive Items (5)" section header
2. Individual cards collapsed - Each item as slim collapsed card
3. Hidden by default - "Show 5 inactive items" button only

**A:** Option 3 - Hidden by default (cleaner, more minimal)

Follow-up: What's the difference between 1 and 3?
- Option 1: Always shows section header even when collapsed
- Option 3: Just a button, no persistent header

**Confirmed:** Option 3 (silent/minimal)

---

### Q6: Expiration Mode Selection

**UI for choosing between expiration modes (explicit date / days / none)?**

Options:
1. Radio buttons - Three options in form
2. Dropdown selector - "Expiration type: [Specific date / Days / None]"
3. Smart field - Single input that adapts (calendar icon or days input)

**A:** Option 3 - Smart field (streamlined)

---

### Q7: Expiration Badge Logic

**For "less than 1 day from now", when should badge NOT show for empty items?**

Options:
1. Within 24 hours - <24 hours from now
2. Today or past - Today or already expired
3. Tomorrow or sooner - Today/tomorrow/past

**A:** Clarification - For ALL empty items, never render expiration badge. Clear expiration date when item becomes empty (nothing to expire).

---

### Q8: Add/Consume Button Interaction

**How should Add/Consume work with packed + unpacked tracking?**

Options:
1. Smart increment - Add = 1 package, Consume = from unpacked first then packages
2. Separate buttons - Four buttons for each type
3. Dialog on click - Single buttons open dialog

**A:** Option 1 - Smart increment (most streamlined)

Follow-up: User clarified - **Configurable consume amount** (e.g., "100ml per consume"). Each click removes preset amount.

---

### Q9: Consume Amount Unit

**What unit should the configurable consume amount use?**

Options:
1. Always in measurement units - Even if tracking in packages
2. Matches tracking unit - Consume in packages if tracking packages, measurement if tracking measurement
3. User chooses unit - Separate selector for consume amount unit

**A:** Option 2 - Matches tracking unit (consistency)

---

### Q10: Add Button Behavior

**Should Add button also be configurable?**

Options:
1. Fixed: always adds 1 package
2. Configurable add amount - Separate setting
3. Symmetrical: use consume amount - Add same as consume

**A:** Option 1 - Always adds 1 package (practical for purchasing)

---

### Q11: Package Unit Optional Behavior

**When package unit is NOT set (only measurement)?**

Options:
1. No packed/unpacked tracking - Falls back to simple quantity
2. Still track packed/unpacked - "Full" vs "partial" without package label
3. Require package for advanced tracking - Explicit message

**A:** Option 1 - Silent fallback (cleaner UX)

Follow-up: What's the difference between 1 and 3?
- Option 1: Silent automatic fallback
- Option 3: Explicit indication of missing feature

**Confirmed:** Silent fallback

---

### Q12: Inventory Logs with Packed/Unpacked

**How should inventory logs track changes?**

Options:
1. Log total change only - Delta is total in tracking unit
2. Log packed + unpacked separately - Store both deltas
3. Log with type flag - Add type field: 'packed' | 'unpacked'

**A:** Option 1 - Log total change only (simpler)

---

### Q13: Expiration Date Clearing

**When quantity reaches 0, what happens to expiration data?**

Original understanding: Clear expiration date when empty

**Clarification:** Keep `estimatedDueDays` (configuration), clear or don't calculate `dueDate`. When quantity > 0 again, recalculate from last purchase + estimatedDueDays.

---

### Q14: Expiration Badge Text Format

**How should expiration badge text differ by mode?**

**A:**
- Explicit date mode: "Expires on 2026-02-13" (YYYY-MM-DD)
- Relative mode: "Expires in 5 days" (countdown text, not date)

---

### Q15: Consume Logic When Unpacked Insufficient

**When consuming more than unpacked amount, what happens?**

Original options about removing unpacked then breaking packages

**Clarification:** User sets consume amount per item (e.g., "100ml"). Each click removes that amount. Logic handles breaking packages automatically.

---

## Final Design Decisions

### Data Model

**New Item fields:**
- `packageUnit?: string` - Optional package type (bottle, pack)
- `measurementUnit?: string` - Optional measurement unit (L, ml)
- `amountPerPackage?: number` - Conversion factor (1L per bottle)
- `targetUnit: 'package' | 'measurement'` - What target is measured in
- `packedQuantity: number` - Number of full packages
- `unpackedQuantity: number` - Partial amount in measurement
- `consumeAmount: number` - Configurable amount per consume click

**Existing fields repurposed:**
- `dueDate` - Explicit date mode (cleared when qty = 0)
- `estimatedDueDays` - Relative mode (kept as config)

**Removed:**
- Old `unit` field (replaced by dual-unit system)

### UI Components

**Item Form:**
- Package unit (optional text)
- Measurement unit (optional text)
- Amount per package (only when both units set)
- Target quantity (number)
- Target unit toggle (only when both units set)
- Consume amount (in tracking unit)
- Smart expiration field (calendar icon / days input)

**Progress Bar:**
- Segmented mode: Each segment = 1 target unit, can be partially filled
- Example: 1 bottle + 700ml → segment 2 is 70% filled

**Add/Consume Buttons:**
- Add: Always adds 1 package (fixed)
- Consume: Removes configured amount, from unpacked first

**Inactive Items:**
- Condition: target = 0 AND current = 0
- Display: "Show X inactive items" button at bottom

**Expiration Badge:**
- Only show when quantity > 0
- Text: "Expires on YYYY-MM-DD" or "Expires in X days"

### Business Logic

**Current Quantity:**
- Dual-unit: `packed * amountPerPackage + unpacked`
- Simple mode: just `packed`

**Consume Logic:**
- Subtract from unpacked first
- If insufficient, break packages to get enough
- Convert excess unpacked to packed automatically

**Expiration:**
- Clear `dueDate` when qty = 0
- Keep `estimatedDueDays` as configuration
- Recalculate when qty > 0

**Inactive Status:**
- `target === 0 && current === 0`
- Sort to bottom, hidden by default

### Migration Strategy

**Existing items:**
- `unit` → `packageUnit`
- Current quantity → `packedQuantity`
- `unpackedQuantity = 0`
- `targetUnit = 'package'`
- `consumeAmount = 1`

**Backwards compatible** - existing items work as simple package tracking

## Rationale

### Why Dual-Unit System

Real-world pantry items come in packages (bottles, packs) but are consumed in measurements (ml, cups). Single-unit tracking forces users to choose one or the other, making tracking less accurate.

**Example:** Milk comes in bottles, but you use "1 cup" in recipes. With dual units:
- Buy: Add 1 bottle (1L)
- Use: Consume 250ml (1 cup)
- Track: 1 bottle + 750ml remaining

### Why Packed/Unpacked Separation

Once you open a package, tracking becomes more granular. Separating packed (whole packages) from unpacked (opened package) provides accurate inventory:
- Know how many sealed packages you have
- Track partial consumption of opened packages
- Progress bar shows both full and partial amounts

### Why Configurable Consume Amount

Different items are consumed in different amounts:
- Milk: 250ml per serving
- Flour: 100g per recipe
- Sugar: 1 tablespoon

Configurable amount makes the Consume button practical for daily use.

### Why Flexible Target Unit

Users think differently about different items:
- Bottled water: Think in bottles ("need 6 bottles")
- Milk: Think in volume ("need 2L")
- Flour: Think in packages ("need 2 bags") or weight ("need 2kg")

Flexible targeting accommodates different mental models.

### Why Clear Expiration on Empty

Empty items have nothing to expire. Clearing the date when quantity reaches 0:
- Removes visual clutter (no badge on empty items)
- Reflects reality (nothing to expire)
- Recalculates when restocked

But keeps `estimatedDueDays` as configuration so it applies to next purchase.

### Why Hide Inactive Items

Items with no target and no stock are effectively archived. Hiding them by default:
- Reduces visual clutter
- Keeps active pantry items prominent
- Still accessible when needed (expand button)

### Why Silent Fallback

Users who don't need complexity shouldn't be forced to understand it. When package unit isn't set:
- System works with simple quantity tracking
- No error messages or warnings
- Progressive enhancement: add features as needed

### Why Smart Expiration Field

Three modes (explicit date / relative days / none) in one field:
- Cleaner UI than radio buttons
- Mode is clear from user action (click calendar vs click days)
- Can leave empty without explicit "none" selection
