# Plan: Batched Cloud Import with Progress UI

## Context

Cloud imports fail with `PayloadTooLargeError` when the exported JSON exceeds the server's body size limit (~100KB default). The fix has two parts: raise the server limit to 1MB as a safety net, and implement client-side batching so large datasets are sent in small chunks regardless of total size.

**Batch size:** 50 entities per request (fixed count, easy to tune).
**Progress UI:** replaces the file input area in ImportCard while importing.
**Retry scope:** resume from the failed batch — skip already-completed batches.

---

## Step 1 — Raise server body limit to 1MB

**File:** `apps/server/src/index.ts` (or wherever `expressMiddleware` / `bodyParser` is configured)

Find the body parser configuration and set the limit to `'1mb'`:

```ts
app.use(express.json({ limit: '1mb' }))
// or if using bodyParser:
app.use(bodyParser.json({ limit: '1mb' }))
```

Also check if Apollo Server's `expressMiddleware` has its own limit option and set it there too if needed.

**Test:** add a server-side test (or note in the existing import resolver test) that a ~900KB payload is accepted.

**Verification gate:** `pnpm --filter server build` (or lint/test equivalent).

---

## Step 2 — Add batching to `importCloudData`

**File:** `apps/web/src/lib/importData.ts`

### 2a. Add a batch helper

```ts
const BATCH_SIZE = 50

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}
```

### 2b. Define progress/state types

```ts
export interface ImportBatchState {
  // Identifies a single batch within the full import run
  entityType: string
  batchIndex: number
}

export interface ImportProgress {
  completedBatches: number
  totalBatches: number
  currentEntity: string // e.g. 'items', 'tags', …
}

export interface ImportSession {
  payload: ExportPayload
  strategy: ImportStrategy
  client: ApolloClient
  // Batches that have already succeeded (used for resume)
  completedBatches: Set<string> // key: `${entityType}:${batchIndex}`
}
```

### 2c. Refactor `bulkCreate` and `bulkUpsert` to accept a session + callbacks

Replace the current `bulkCreate(client, data)` with a version that:
- Chunks each entity array into batches of `BATCH_SIZE`
- Skips batches already in `session.completedBatches`
- Calls `onProgress` after each successful batch
- On failure, throws with enough context to identify the failed batch

```ts
async function bulkCreateBatched(
  session: ImportSession,
  data: ExportPayload,
  onProgress: (p: ImportProgress) => void,
): Promise<void>

async function bulkUpsertBatched(
  session: ImportSession,
  data: ExportPayload,
  onProgress: (p: ImportProgress) => void,
): Promise<void>
```

The `totalBatches` value is computed once upfront (sum of `Math.ceil(arr.length / BATCH_SIZE)` for every entity type in `data`).

### 2d. Update `importCloudData` signature

```ts
export async function importCloudData(
  payload: ExportPayload,
  strategy: ImportStrategy,
  client: ApolloClient,
  options?: {
    onProgress?: (p: ImportProgress) => void
    session?: ImportSession   // provided on retry to resume
  },
): Promise<ImportSession>    // returns the session so caller can retry on failure
```

- If `options.session` is provided, reuse its `completedBatches` set (resume mode).
- On success, return the completed session (all batches marked done).
- On failure, throw — but the session's `completedBatches` reflects what succeeded so far; the caller holds the session and can pass it back on retry.

**Tests:**
- `importCloudData` with mocked Apollo calls: verify `onProgress` is called the right number of times.
- Verify that when a mid-way batch fails, re-calling with the same session skips already-completed batches.

---

## Step 3 — Progress UI in ImportCard

**File:** `apps/web/src/components/settings/ImportCard/index.tsx`

### 3a. Add import state to component

```ts
type ImportStatus =
  | { phase: 'idle' }
  | { phase: 'conflict', conflicts: ConflictSummary, payload: ExportPayload }
  | { phase: 'importing', progress: ImportProgress, session: ImportSession }
  | { phase: 'error', error: string, session: ImportSession }  // session held for retry
  | { phase: 'done' }
```

### 3b. Progress view (replaces file input area while importing)

Shown when `phase === 'importing'`:

```
Importing [currentEntity]…
[████████░░░░░░░░]  8 / 24 batches
```

- Progress bar: `completedBatches / totalBatches`
- Label: entity type name (translated via i18n)
- No cancel button (partial imports are hard to roll back cleanly)

### 3c. Error view (shown when `phase === 'error'`)

```
Import failed during [entity] batch [N].
[Retry]
```

- `Retry` button calls `importCloudData` again with the saved `session` (resume mode).
- Error message shows which entity type and batch failed.

### 3d. Done view (shown when `phase === 'done'`)

```
Import complete. ✓
```

Auto-dismiss after 2 seconds, or user can click to dismiss.

**Storybook stories to add:**
- `ImportingProgress` — shows the progress bar mid-import
- `ImportError` — shows the error + Retry button
- `ImportDone` — shows the success state

**Tests (`.stories.test.tsx` smoke test + unit tests):**
- Renders progress bar with correct percentage
- Renders Retry button on error
- Clicking Retry calls `importCloudData` with the saved session

---

## Step 4 — Wire i18n strings

**Files:** `apps/web/src/i18n/locales/en.json`, `tw.json`

Add keys under `settings.import` (or similar):

```json
{
  "settings": {
    "import": {
      "importing": "Importing {{entity}}…",
      "batchProgress": "{{completed}} / {{total}} batches",
      "error": "Import failed. {{count}} batches completed before the error.",
      "retry": "Retry",
      "done": "Import complete."
    }
  }
}
```

---

## Verification gate (after all steps)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Then run related E2E tests:

```bash
pnpm test:e2e --grep "settings|import"
```

---

## File summary

| File | Change |
|------|--------|
| `apps/server/src/index.ts` | Raise body limit to 1MB |
| `apps/web/src/lib/importData.ts` | Add `chunk`, `ImportSession`, `ImportProgress` types; refactor `bulkCreate`/`bulkUpsert` to batch; update `importCloudData` signature |
| `apps/web/src/lib/importData.test.ts` | Tests for batching and resume |
| `apps/web/src/components/settings/ImportCard/index.tsx` | Progress/error/done UI states |
| `apps/web/src/components/settings/ImportCard/index.stories.tsx` | New stories for in-progress, error, done |
| `apps/web/src/components/settings/ImportCard/index.stories.test.tsx` | Smoke tests |
| `apps/web/src/i18n/locales/en.json` | New import progress strings |
| `apps/web/src/i18n/locales/tw.json` | TW translations |
