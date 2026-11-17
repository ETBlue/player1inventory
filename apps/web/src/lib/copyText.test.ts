import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copyText'

// `copyText` (households H5b, task G.9): the Clipboard API first, then a
// selected text area and `execCommand('copy')`.

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard',
)

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  })
}

function setExecCommand(fn: ((command: string) => boolean) | undefined) {
  Object.defineProperty(document, 'execCommand', {
    value: fn,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  if (originalClipboard)
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
})

describe('copyText', () => {
  it('uses the Clipboard API when it is there', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard({ writeText })
    const execCommand = vi.fn(() => true)
    setExecCommand(execCommand)

    await expect(copyText('https://x/join/abc')).resolves.toBe(true)

    expect(writeText).toHaveBeenCalledWith('https://x/join/abc')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('falls back to a selected text area when there is no Clipboard API', async () => {
    setClipboard(undefined)
    let selected = ''
    const execCommand = vi.fn((command: string) => {
      // What is selected when the browser copies
      const area = document.querySelector('textarea')
      selected = area ? area.value : ''
      return command === 'copy'
    })
    setExecCommand(execCommand)

    await expect(copyText('https://x/join/abc')).resolves.toBe(true)

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(selected).toBe('https://x/join/abc')
    // The text area is gone again
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when the Clipboard API refuses', async () => {
    setClipboard({
      writeText: vi.fn(async () => {
        throw new Error('NotAllowedError')
      }),
    })
    const execCommand = vi.fn(() => true)
    setExecCommand(execCommand)

    await expect(copyText('t')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('answers false when neither way works', async () => {
    setClipboard(undefined)
    setExecCommand(() => false)
    await expect(copyText('t')).resolves.toBe(false)

    setExecCommand(undefined)
    await expect(copyText('t')).resolves.toBe(false)
  })

  it('copies from the given field, not from a text area on the body, when one is passed', async () => {
    // Given a field inside a dialog that shows the link
    setClipboard(undefined)
    const field = document.createElement('input')
    field.value = 'https://x/join/abc'
    document.body.appendChild(field)
    let focused: Element | null = null
    let selected = ''
    const execCommand = vi.fn(() => {
      focused = document.activeElement
      selected = field.value.slice(
        field.selectionStart ?? 0,
        field.selectionEnd ?? 0,
      )
      // No text area was added
      expect(document.querySelector('textarea')).toBeNull()
      return true
    })
    setExecCommand(execCommand)

    await expect(copyText('https://x/join/abc', { from: field })).resolves.toBe(
      true,
    )

    // Then the copy ran with that field focused and its whole text selected
    expect(focused).toBe(field)
    expect(selected).toBe('https://x/join/abc')
    field.remove()
  })
})
