import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// The `.graphql` files are read from the folder of the file that RUNS this
// code, so the same line works in three places:
//
// | Where                        | Running file              | Folder read    |
// |------------------------------|---------------------------|----------------|
// | `pnpm dev` (tsx), Vitest     | `src/schema/index.ts`     | `src/schema/`  |
// | `node dist/index.js` (build) | `dist/index.js`, a bundle | `dist/`        |
//
// In the bundle this module is inlined into `dist/index.js`, so
// `import.meta.url` is the bundle's URL. That is why `scripts/build.mjs`
// copies the `.graphql` files FLAT into `dist/`, not into `dist/schema/`.
// `scripts/check-start.mjs` starts the bundle and fails if a file is missing.
const __dirname = dirname(fileURLToPath(import.meta.url))

function load(filename: string): string {
  return readFileSync(join(__dirname, filename), 'utf-8')
}

export const typeDefs = [load('schema.graphql'), load('item.graphql'), load('tag.graphql'), load('vendor.graphql'), load('recipe.graphql'), load('import.graphql'), load('cart.graphql'), load('inventoryLog.graphql'), load('shelf.graphql'), load('location.graphql'), load('itemStock.graphql'), load('household.graphql')]
