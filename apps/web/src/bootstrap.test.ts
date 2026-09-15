import { describe, expect, it, vi } from 'vitest'
import { bootstrapCloudMode } from './bootstrap'

describe('bootstrapCloudMode', () => {
  it('user sees restored data because the cache is restored before the app renders', async () => {
    // Given a restore that only finishes when we tell it to
    let releaseRestore: () => void = () => {}
    const restorePending = new Promise<void>((resolve) => {
      releaseRestore = resolve
    })
    const restore = vi.fn(() => restorePending)
    const render = vi.fn()

    // When bootstrapping starts
    const done = bootstrapCloudMode(restore, render)

    // Then render has NOT run yet, because restore has not finished
    expect(render).not.toHaveBeenCalled()

    // When restore finishes
    releaseRestore()
    await done

    // Then render has run
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('user still sees the app when restoring fails', async () => {
    // Given a restore that rejects
    const restore = vi.fn(() => Promise.reject(new Error('restore failed')))
    const render = vi.fn()

    // When bootstrapping runs
    await bootstrapCloudMode(restore, render)

    // Then the app still renders, so the user is not left with a blank page
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('user sees the app render exactly once', async () => {
    // Given a restore that succeeds
    const restore = vi.fn(() => Promise.resolve())
    const render = vi.fn()

    // When bootstrapping runs
    await bootstrapCloudMode(restore, render)

    // Then render was called exactly once, not zero and not twice
    expect(render).toHaveBeenCalledTimes(1)
  })
})
