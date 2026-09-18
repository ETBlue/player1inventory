import { describe, expect, it } from 'vitest'
import { isAllowedOrigin } from './cors.js'

const CLIENT_ORIGIN = 'https://player1inventory.etblue.tw'

describe('isAllowedOrigin', () => {
  it('user loads the production web app and its exact configured origin is allowed', () => {
    // Given the configured client origin
    // When checking that exact origin
    // Then it is allowed
    expect(isAllowedOrigin(CLIENT_ORIGIN, CLIENT_ORIGIN)).toBe(true)
  })

  it('user opens a per-deployment Cloudflare Pages preview and it is allowed', () => {
    // Given a per-deployment preview origin (hash changes on every deploy)
    // When checking it against the configured client origin
    // Then it is allowed
    expect(isAllowedOrigin('https://5bb1b97f.player1inventory.pages.dev', CLIENT_ORIGIN)).toBe(
      true,
    )
  })

  it('user opens a per-branch Cloudflare Pages preview and it is allowed', () => {
    // Given a per-branch preview origin (stable across deployments on that branch)
    // When checking it against the configured client origin
    // Then it is allowed
    expect(
      isAllowedOrigin('https://feature-pwa-offline.player1inventory.pages.dev', CLIENT_ORIGIN),
    ).toBe(true)
  })

  it('a request with no Origin header (curl, health check, same-origin) is allowed', () => {
    // Given no Origin header at all — this is what the cors package passes for
    // same-origin requests, curl, and Railway's health check
    // When checking it
    // Then it is allowed, so the health check never breaks
    expect(isAllowedOrigin(undefined, CLIENT_ORIGIN)).toBe(true)
  })

  it('a plain http preview origin is rejected — https only', () => {
    // Given the same preview host but over http instead of https
    // When checking it
    // Then it is rejected
    expect(isAllowedOrigin('http://5bb1b97f.player1inventory.pages.dev', CLIENT_ORIGIN)).toBe(
      false,
    )
  })

  it('an unrelated origin is rejected', () => {
    // Given an origin with no relation to the client origin or the project
    // When checking it
    // Then it is rejected
    expect(isAllowedOrigin('https://evil.com', CLIENT_ORIGIN)).toBe(false)
  })

  it('an origin that stuffs the allowed suffix into a query string is rejected', () => {
    // Given an origin whose host is evil.com, with the allowed suffix hidden
    // in the query string — this is exactly what an unanchored regex would match
    // When checking it
    // Then it is rejected
    expect(
      isAllowedOrigin('https://evil.com/?x=.player1inventory.pages.dev', CLIENT_ORIGIN),
    ).toBe(false)
  })

  it('a lookalike origin with the project domain as a prefix is rejected', () => {
    // Given an origin that starts with the real project domain but is actually
    // a subdomain of evil.com
    // When checking it
    // Then it is rejected
    expect(
      isAllowedOrigin('https://player1inventory.pages.dev.evil.com', CLIENT_ORIGIN),
    ).toBe(false)
  })

  it('an origin with two label segments is rejected — only one label is allowed', () => {
    // Given an origin with a dot inside what would be the label
    // When checking it
    // Then it is rejected
    expect(isAllowedOrigin('https://a.b.player1inventory.pages.dev', CLIENT_ORIGIN)).toBe(false)
  })

  it('a different Cloudflare Pages project is rejected', () => {
    // Given a Pages preview that belongs to a different project
    // When checking it
    // Then it is rejected
    expect(isAllowedOrigin('https://otherproject.pages.dev', CLIENT_ORIGIN)).toBe(false)
  })

  // The two tests above (query-string stuffing and lookalike prefix) already
  // reject correctly even without one of the two anchors, because the pattern
  // also requires the literal "https://" scheme to sit directly next to the
  // label. These two extra cases isolate each anchor on its own, so a mutation
  // that drops just one anchor is guaranteed to be caught by at least one test.
  it('a valid origin with extra text before it is rejected — the match must start at the beginning', () => {
    // Given a string where the valid pattern appears, but not at position 0
    // When checking it
    // Then it is rejected
    expect(isAllowedOrigin('xhttps://5x.player1inventory.pages.dev', CLIENT_ORIGIN)).toBe(false)
  })

  it('a valid origin with extra text after it is rejected — the match must end at the end', () => {
    // Given a string where the valid pattern appears, but more text follows it
    // When checking it
    // Then it is rejected
    expect(
      isAllowedOrigin('https://5x.player1inventory.pages.dev.evil.com', CLIENT_ORIGIN),
    ).toBe(false)
  })
})
