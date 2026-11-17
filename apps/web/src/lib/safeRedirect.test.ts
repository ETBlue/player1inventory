import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from './safeRedirect'

describe('safeRedirectPath', () => {
  it('keeps a same-origin path', () => {
    expect(safeRedirectPath('/join/abc')).toBe('/join/abc')
  })

  it('keeps the search string of a same-origin path', () => {
    expect(safeRedirectPath('/join/abc?x=1')).toBe('/join/abc?x=1')
  })

  it('refuses a protocol-relative URL', () => {
    // `//evil.example` is a full URL to another site in every browser
    expect(safeRedirectPath('//evil.example')).toBe('/')
    expect(safeRedirectPath('//evil.example/join/abc')).toBe('/')
  })

  it('refuses a backslash after the first slash', () => {
    // Browsers read `/\evil.example` as `//evil.example`
    expect(safeRedirectPath('/\\evil.example')).toBe('/')
  })

  it('refuses a full URL', () => {
    expect(safeRedirectPath('https://evil.example')).toBe('/')
    expect(safeRedirectPath('http://evil.example/join/abc')).toBe('/')
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/')
  })

  it('refuses a path that does not start with a slash', () => {
    expect(safeRedirectPath('join/abc')).toBe('/')
  })

  it('refuses a path with a control character', () => {
    // A tab or a new line inside a URL is dropped by the browser, so
    // `/\t/evil.example` would become `//evil.example`
    expect(safeRedirectPath('/\t/evil.example')).toBe('/')
    expect(safeRedirectPath('/\n/evil.example')).toBe('/')
  })

  it('refuses a path that a browser resolves to another host', () => {
    // `/..//evil.example` passes a plain "starts with //" check, but the
    // browser removes the `..` segment and goes to `//evil.example`
    expect(safeRedirectPath('/..//evil.example')).toBe('/')
    expect(safeRedirectPath('/.//evil.example')).toBe('/')
    expect(safeRedirectPath('/%2e%2e//evil.example')).toBe('/')
    expect(safeRedirectPath('/%2E%2E//evil.example/join/abc')).toBe('/')
    expect(safeRedirectPath('/./\\evil.example')).toBe('/')
  })

  it('returns the path the browser would go to', () => {
    // A harmless `..` is resolved, so the result is what was checked
    expect(safeRedirectPath('/settings/../join/abc')).toBe('/join/abc')
    expect(safeRedirectPath('/join/abc#top')).toBe('/join/abc#top')
  })

  it('refuses anything that is not a string', () => {
    expect(safeRedirectPath(undefined)).toBe('/')
    expect(safeRedirectPath(null)).toBe('/')
    expect(safeRedirectPath('')).toBe('/')
    expect(safeRedirectPath(42)).toBe('/')
    expect(safeRedirectPath({ to: '/join/abc' })).toBe('/')
  })
})
