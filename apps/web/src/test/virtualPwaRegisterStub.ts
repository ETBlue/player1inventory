// Stub for the `virtual:pwa-register` module vite-plugin-pwa generates at
// build time. Vite has no plugin to resolve that id under Vitest, so a plain
// `vi.mock('virtual:pwa-register', ...)` cannot even load — the import fails
// to resolve before any mock runs. `vitest.config.ts` aliases the specifier
// to this file so it resolves to a real module; `src/test/setup.ts` then
// mocks it globally, and individual tests may mock it again per-file.
export function registerSW(): () => Promise<void> {
  return () => Promise.resolve()
}
