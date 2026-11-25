# Brainstorming: inventory log layout and stock count rows

Date: 2026-11-25. Owner and main session.

## The request (owner)

Change the item Log tab:

- Row 1: (+ or −)(amount)(unit) from (vendor / recipe / 盤點), then the quantity after the
  change on the right.
- Row 2: date, weekday and time.

盤點 is the user's manual correction of the amount. It writes no log today. The owner wants
it logged, because it is "way more commonly used for amount reduction than cooking".

## What the code does today (checked)

| Part | Today |
|---|---|
| Log tab (`routes/items/$id/log.tsx`) | `+delta → quantity packageUnit`, then `t(logKey, logParams)` or `note`; date and time on the right |
| Who writes logs | `checkout` (purchase) and `consumeRecipes` (cooking), in both modes |
| Manual changes | the Stock tab Save and the pantry Quick update write `ItemStock` only, no log |
| Units | checkout: `delta` and `quantity` in packages. Cooking: `delta` in the tracking unit, `quantity` in packages. The tab always shows `packageUnit` |
| What a row stores | `logKey` (an i18n key path such as `shopping.log.purchasedAt`), `logParams` (NAMES: `{ vendor: "Costco" }`, `{ recipes: "Curry, Soup" }`; "No vendor" translated at write time), and ALSO `note`, the whole sentence translated at write time. The tab reads `note` only when there is no `logKey` |
| Last purchase date | the newest log row with `delta > 0` (`lastPurchaseDates` on the server, `getLastPurchaseDate` in local mode). It also feeds the expiry date of "days from purchase" items, and the "purchased" sort |

## Decisions

| # | Question | Answer |
|---|---|---|
| Q1 | Which manual changes write a stock count row | **Both**: the Stock tab Save and Quick update |
| Q2 | Unit shown | **The item's tracking unit**, converted with `amountPerPackage` |
| Q3 | English label for 盤點 | **Stock count** |
| Q4 | Wording of row 1 | "from" fits a purchase but reads oddly for a reduction. **A label per kind**: "Bought at {vendor}" / 「在 {vendor} 購買」, "Used in {recipes}" / 「用於 {recipes}」, "Stock count" / 「盤點」 |
| Q5 | Who writes the stock count row (owner asked) | **The server**, inside `upsertItemStock`, in the same transaction as the stock write. No extra request from the web. Local mode does the same inside its own Dexie transaction |
| Q6 | Save text or data (owner asked) | **Data only.** New rows store no `note`. `logKey` names the kind (`purchase`, `cooking`, `stockCount`), not an i18n path. Params store ids plus a name snapshot. The web translates when it shows the row. Old rows stay readable |
| Q7 | Last purchase date after stock counts exist (owner asked) | **Option A**: `delta > 0` and the row is not a stock count. Every row counted today still counts. Option B (purchase rows only) was rejected: rows from before `logKey` existed would lose their date, and their expiry date with it |

See `2026-11-25-inventory-log-layout-design.md`.
