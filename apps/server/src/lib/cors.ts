// CORS origin allowlist.
//
// The production web app uses one fixed origin (CLIENT_ORIGIN, or
// DEFAULT_CLIENT_ORIGIN as a fallback). Cloudflare Pages preview deployments
// use a different origin per deployment and per branch, both under the
// `player1inventory.pages.dev` project:
//
//   https://5bb1b97f.player1inventory.pages.dev          (per deployment, hash changes)
//   https://feature-pwa-offline.player1inventory.pages.dev  (per branch, stable)
//
// This module allows both shapes without allowing arbitrary origins.

// Matches `https://<label>.player1inventory.pages.dev` and nothing else.
//
// - `^` and `$` anchor the match to the WHOLE string. Without both anchors,
//   `.test()` only needs to find the pattern somewhere inside the origin, so
//   an attacker could tack the allowed suffix onto their own origin (see the
//   lookalike/query-string tests in cors.test.ts).
// - `https:\/\/` is a literal scheme. `http://` must never pass.
// - `[a-zA-Z0-9-]+` is exactly one label: letters, digits, hyphens. No dot is
//   allowed in the label, so `a.b.player1inventory.pages.dev` (two labels)
//   cannot match — that keeps the label from smuggling in another domain.
// - The rest, `\.player1inventory\.pages\.dev`, is the literal Cloudflare
//   Pages project domain, with dots escaped so they mean "dot" and not "any
//   character". This also stops a different project
//   (`https://x.otherproject.pages.dev`) or the project's own bare domain
//   (`https://player1inventory.pages.dev`, which has no label at all) from
//   matching.
export const PAGES_DEV_PREVIEW_ORIGIN = /^https:\/\/[a-zA-Z0-9-]+\.player1inventory\.pages\.dev$/

/**
 * Decide whether a request Origin header is allowed.
 *
 * `origin` is `undefined` for requests that carry no Origin header at all —
 * same-origin requests, curl, and Railway's health check. There is no origin
 * to compare in that case, so it is allowed rather than rejected: rejecting
 * it would break the health check the deploy depends on.
 */
export function isAllowedOrigin(origin: string | undefined, clientOrigin: string): boolean {
  if (origin === undefined) return true
  if (origin === clientOrigin) return true
  return PAGES_DEV_PREVIEW_ORIGIN.test(origin)
}
