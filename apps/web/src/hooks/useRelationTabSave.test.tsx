// The item Tags, Vendors and Recipes tabs' link to the item layout: the dirty
// state, the unsaved-changes dialog's Save, and the top bar slot.
// Design: docs/features/items/2026-11-27-item-relations-save-design.md.
import { act, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ItemLayoutProvider, useItemLayout } from './useItemLayout'
import {
  type RelationTabSaveInput,
  useRelationTabSave,
} from './useRelationTabSave'

type Layout = ReturnType<typeof useItemLayout>

function setup(initial: RelationTabSaveInput) {
  const layout: { current: Layout | null } = { current: null }
  function Probe() {
    layout.current = useItemLayout()
    return null
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ItemLayoutProvider>
        <Probe />
        {children}
      </ItemLayoutProvider>
    )
  }
  const hook = renderHook(
    (props: RelationTabSaveInput) => useRelationTabSave(props),
    {
      initialProps: initial,
      wrapper: Wrapper,
    },
  )
  const read = () => {
    if (!layout.current) throw new Error('layout not mounted')
    return layout.current
  }
  return { ...hook, layout: read }
}

const save = vi.fn(async () => true)

describe('useRelationTabSave', () => {
  it('reports the draft as dirty to the layout, and Save is on', () => {
    const { result, layout } = setup({
      dirty: true,
      isPending: false,
      canEdit: true,
      save,
    })
    expect(layout().isDirty).toBe(true)
    expect(result.current.canSave).toBe(true)
    expect(layout().saveControl?.canSave).toBe(true)
  })

  it('Save is off while a save runs, and while nothing changed', () => {
    const { result, rerender, layout } = setup({
      dirty: true,
      isPending: true,
      canEdit: true,
      save,
    })
    expect(result.current.canSave).toBe(false)
    expect(layout().saveControl?.canSave).toBe(false)

    rerender({ dirty: false, isPending: false, canEdit: true, save })
    expect(result.current.canSave).toBe(false)
    expect(layout().isDirty).toBe(false)
  })

  it('read only: not dirty, no SaveControl and no slot', () => {
    const { result, layout } = setup({
      dirty: true,
      isPending: false,
      canEdit: false,
      save,
    })
    expect(layout().isDirty).toBe(false)
    expect(layout().saveControl).toBeNull()
    expect(result.current.canSave).toBe(false)
    expect(result.current.saveSlot).toBeNull()
  })

  it('losing the edit right takes the SaveControl back', () => {
    const { rerender, layout } = setup({
      dirty: true,
      isPending: false,
      canEdit: true,
      save,
    })
    expect(layout().saveControl).not.toBeNull()

    rerender({ dirty: true, isPending: false, canEdit: false, save })
    expect(layout().saveControl).toBeNull()
    expect(layout().isDirty).toBe(false)
  })

  it('the dialog Save runs the tab save', async () => {
    const tabSave = vi.fn(async () => false)
    const { layout } = setup({
      dirty: true,
      isPending: false,
      canEdit: true,
      save: tabSave,
    })
    let answer: boolean | undefined
    await act(async () => {
      answer = await layout().saveControl?.save()
    })
    expect(tabSave).toHaveBeenCalledTimes(1)
    expect(answer).toBe(false)
  })

  it('unmount reports the tab as not dirty and takes the SaveControl back', () => {
    // The layout stays mounted while only the tab goes away
    let latest: Layout | null = null
    function Reader() {
      latest = useItemLayout()
      return null
    }
    function Tab() {
      useRelationTabSave({ dirty: true, isPending: false, canEdit: true, save })
      return null
    }
    function Outer({ showTab }: { showTab: boolean }) {
      return (
        <ItemLayoutProvider>
          <Reader />
          {showTab && <Tab />}
        </ItemLayoutProvider>
      )
    }
    const read = () => latest as Layout | null

    const view = render(<Outer showTab />)
    expect(read()?.isDirty).toBe(true)
    expect(read()?.saveControl).not.toBeNull()

    view.rerender(<Outer showTab={false} />)
    expect(read()?.isDirty).toBe(false)
    expect(read()?.saveControl).toBeNull()
  })

  it('returns the top bar slot when the person may edit', () => {
    const slot = document.createElement('div')
    function SetSlot() {
      const { setSaveSlot } = useItemLayout()
      useEffect(() => setSaveSlot(slot), [setSaveSlot])
      return null
    }
    let got: HTMLElement | null = null
    function Tab() {
      got = useRelationTabSave({
        dirty: false,
        isPending: false,
        canEdit: true,
        save,
      }).saveSlot
      return null
    }
    render(
      <ItemLayoutProvider>
        <SetSlot />
        <Tab />
      </ItemLayoutProvider>,
    )
    expect(got).toBe(slot)
  })
})
