import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TagLayoutProvider, useTagLayout } from './useTagLayout'

describe('useTagLayout', () => {
  it('throws error when used outside provider', () => {
    expect(() => {
      renderHook(() => useTagLayout())
    }).toThrow('useTagLayout must be used within TagLayoutProvider')
  })

  it('provides isDirty state and registerDirtyState function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TagLayoutProvider>{children}</TagLayoutProvider>
    )

    const { result } = renderHook(() => useTagLayout(), { wrapper })

    expect(result.current.isDirty).toBe(false)
    expect(typeof result.current.registerDirtyState).toBe('function')
  })

  it('updates isDirty when registerDirtyState is called', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TagLayoutProvider>{children}</TagLayoutProvider>
    )

    const { result } = renderHook(() => useTagLayout(), { wrapper })

    act(() => {
      result.current.registerDirtyState(true)
    })

    expect(result.current.isDirty).toBe(true)

    act(() => {
      result.current.registerDirtyState(false)
    })

    expect(result.current.isDirty).toBe(false)
  })
})
