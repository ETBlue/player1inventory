import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDataMode } from './useDataMode'

afterEach(() => {
  localStorage.clear()
})

describe('useDataMode', () => {
  it('defaults to local mode when nothing is stored', () => {
    const { result } = renderHook(() => useDataMode())
    expect(result.current.mode).toBe('local')
  })

  it('reads stored mode from localStorage', () => {
    localStorage.setItem('data-mode', 'cloud')
    const { result } = renderHook(() => useDataMode())
    expect(result.current.mode).toBe('cloud')
  })

  it('setMode updates localStorage and returns new mode', () => {
    const { result } = renderHook(() => useDataMode())
    act(() => result.current.setMode('cloud'))
    expect(result.current.mode).toBe('cloud')
    expect(localStorage.getItem('data-mode')).toBe('cloud')
  })
})
