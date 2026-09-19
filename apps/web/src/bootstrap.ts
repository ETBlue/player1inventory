/**
 * Runs the cloud-mode startup steps in the required order.
 *
 * `restore` MUST finish before `render` runs. If React mounts first, the first
 * queries resolve against an empty cache and then overwrite the saved copy
 * with empty results. The start that was supposed to use the saved data would
 * destroy it instead.
 *
 * `render` still runs when `restore` fails. A broken cache must not leave the
 * user with a blank page.
 */
export async function bootstrapCloudMode(
  restore: () => Promise<unknown>,
  render: () => void,
): Promise<void> {
  try {
    await restore()
  } catch (error) {
    console.error('Cache restore failed:', error)
  }
  render()
}
