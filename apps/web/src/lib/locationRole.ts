/**
 * `locationRoleAtLeast(role, min)`: `true` when a location role is `min` or
 * stronger (`viewer < participant < organizer`). `null` or `undefined` (no
 * role) is never enough.
 *
 * This is the shared copy from `@p1i/types` (households H5c, decision T33).
 * The server ranks roles with the same map, so the web and the server give
 * the same answer. The web's own rank map was deleted. The generated
 * `LocationRole` type and the package's `LocationRoleName` are the same three
 * strings, so a `LocationRole` can be passed in directly.
 *
 * A module of its own, not part of `hooks/usePermissions.ts`: several test
 * files replace that module with a mock that exports only `usePermissions`,
 * and `ActiveLocationProvider` (which every page mounts) needs this too.
 */
export { locationRoleAtLeast } from '@p1i/types'
