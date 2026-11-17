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

  it('refuses anything that is not a string', () => {
    expect(safeRedirectPath(undefined)).toBe('/')
    expect(safeRedirectPath(null)).toBe('/')
    expect(safeRedirectPath('')).toBe('/')
    expect(safeRedirectPath(42)).toBe('/')
    expect(safeRedirectPath({ to: '/join/abc' })).toBe('/')
  })
})
