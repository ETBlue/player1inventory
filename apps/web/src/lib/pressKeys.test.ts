import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { pressOnEnterOrSpace } from './pressKeys'

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent
}

describe('pressOnEnterOrSpace', () => {
  it.each([
    'Enter',
    ' ',
  ])('presses on %j and stops the default action', (key) => {
    const press = vi.fn()
    const event = keyEvent(key)

    pressOnEnterOrSpace(press)(event)

    expect(press).toHaveBeenCalledTimes(1)
    // Space would scroll the page otherwise
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it.each(['Tab', 'a', 'Escape'])('does nothing on %j', (key) => {
    const press = vi.fn()
    const event = keyEvent(key)

    pressOnEnterOrSpace(press)(event)

    expect(press).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
