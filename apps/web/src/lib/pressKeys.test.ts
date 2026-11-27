import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { pressOnEnterOrSpace } from './pressKeys'

function keyEvent(key: string, repeat = false) {
  return { key, repeat, preventDefault: vi.fn() } as unknown as KeyboardEvent
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

  // A held key sends one keydown, then more with `repeat: true`. A real
  // button presses once; without this check the badge flipped on every
  // repeat, so its state after the key was let go was a guess.
  it.each([
    'Enter',
    ' ',
  ])('does not press again while %j is held down', (key) => {
    const press = vi.fn()
    const event = keyEvent(key, true)

    pressOnEnterOrSpace(press)(event)

    expect(press).not.toHaveBeenCalled()
    // Still no page scroll on a held Space
    expect(event.preventDefault).toHaveBeenCalled()
  })
})
