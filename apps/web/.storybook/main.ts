import { fileURLToPath } from 'url'
import path from 'path'
import type { StorybookConfig } from '@storybook/react-vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
    '@storybook/addon-themes',
  ],
  framework: '@storybook/react-vite',
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // Replace @clerk/react with a stub so Clerk hooks don't throw
      // "Missing ClerkProvider" errors in Storybook stories.
      '@clerk/react': path.resolve(__dirname, './mocks/clerk.tsx'),
    }
    // VitePWA() (in the app's vite.config.ts, which @storybook/react-vite
    // merges in) returns an ARRAY of plugins, so it shows up here as one
    // nested array element rather than a top-level plugin — a shallow
    // filter over config.plugins never matches it and leaves it in place.
    // Recurse into nested arrays to find and drop the one plugin we want.
    type MaybePlugin = { name?: unknown } | MaybePlugin[] | null | undefined
    function stripPlugin(
      plugins: readonly MaybePlugin[],
      name: string,
    ): MaybePlugin[] {
      return plugins
        .map((p) => (Array.isArray(p) ? stripPlugin(p, name) : p))
        .filter((p) => {
          if (Array.isArray(p)) return true
          return !(p && 'name' in p && p.name === name)
        })
    }
    // Storybook's own static build has no PWA of its own, and its manager
    // bundle (~3.25 MB) exceeds workbox's default 2 MiB precache file-size
    // limit — "vite-plugin-pwa:build" is the plugin whose closeBundle hook
    // runs the workbox SW-generation step, and it throws on that oversized
    // asset, failing the whole build. Drop only that one plugin, not the
    // rest of the VitePWA family: "vite-plugin-pwa" (bare name) is the one
    // that resolves the `virtual:pwa-register` module useServiceWorkerUpdate
    // imports, and removing it breaks the build a different way — Rollup
    // can no longer resolve that import at all.
    config.plugins = stripPlugin(
      (config.plugins ?? []) as readonly MaybePlugin[],
      'vite-plugin-pwa:build',
    ) as typeof config.plugins
    return config
  },
}
export default config
