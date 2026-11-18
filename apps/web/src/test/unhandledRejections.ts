// Records every unhandled promise rejection while a test runs, so a test can
// assert that a failed save is caught by the screen and not left to the
// browser. Same approach as `usePostLoginMigration.test.ts`.
//
//   const rejections = watchUnhandledRejections()
//   afterEach(() => rejections.stop())
//   …
//   await rejections.settle()
//   expect(rejections.list).toEqual([])
export function watchUnhandledRejections() {
  const list: unknown[] = []
  const onUnhandled = (reason: unknown) => {
    list.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  return {
    list,
    /** Lets pending handlers and Node's unhandled-rejection check run. */
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
    stop() {
      process.off('unhandledRejection', onUnhandled)
    },
  }
}
