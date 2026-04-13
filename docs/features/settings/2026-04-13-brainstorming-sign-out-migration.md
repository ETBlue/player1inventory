# Brainstorming: Sign Out Button, Switch Symmetry & Migration Wiring

**Date:** 2026-04-13  
**Topic:** Add sign-out to settings, make Switch button symmetric, wire migration TODOs  
**Outcome:** Design doc at `2026-04-13-sign-out-migration-design.md`

---

## Questions & Answers

**Q: Where should the sign-out button live?**  
A: Inside `CloudModeCardContent` in `DataModeCard`, alongside the signed-in email line. Not a separate card.

**Q: What happens after sign out (with or without mode switch)?**  
A: Two paths:
- Sign out + stay in cloud → `clerk.signOut()` → auth guard in `__root.tsx` redirects to `/sign-in`
- Sign out + switch to offline → `exportCloudData()` (optional) → `importLocalData()` (optional) → `clerk.signOut()` → `localStorage.setItem('data-mode', 'local')` → `window.location.reload()`

**Q: Confirmation dialogs?**  
A: Two-dialog flow: Dialog 1 asks about mode switch; Dialog 2 (conditional) asks about data migration.

**Q: What's the difference between "Sign Out" and "Switch..."?**  
A: "Switch..." keeps Clerk session alive (seamless re-enable). "Sign Out" terminates the session. Both offer data migration when switching to offline.

**Q: Should the Switch button be symmetric between modes?**  
A: Yes. Cloud → Offline: existing flow (keep Clerk alive, optional migrate). Offline → Cloud: mirror, but migration must happen post-login. `PostLoginMigrationDialog` handles it automatically (IndexedDB persists across mode switches).

**Q: Is local → cloud migration technically feasible?**  
A: Yes. Infrastructure already exists:
- `exportAllData()` reads IndexedDB → `ExportPayload`
- `importCloudData(payload, strategy, apolloClient)` sends via GraphQL bulk mutations
- `PostLoginMigrationDialog` detects "first sign-in with local data" — `importData()` inside is a TODO stub
- Wiring these together completes the feature

**Q: Does offline → cloud Switch need a migration dialog upfront?**  
A: No — migration needs auth, which hasn't happened yet. Solution: `PostLoginMigrationDialog` fires automatically after sign-in if local data exists. The enable dialog can note this: "After signing in, you'll be offered to import your local data."

**Q: Should the DataModeCard be refactored?**  
A: Yes. The thin layers (`CloudModeCardContent` / `CloudModeCardWithUser` / `CloudModeCard` / `CloudDisableFlow`) are confusing. Flatten into a simpler structure. Also adopt new file naming convention: `DataModeCard.tsx` + `index.ts` barrel.

**Q: i18n key naming?**  
A: Rename `disableButton` → `switchButton` (button is about switching, not disabling). New sign-out keys added under `settings.dataMode.signOut.*`.

---

## Decisions

1. **Sign Out button** — inline with email in cloud mode card; two-dialog flow (mode switch? → migrate data?)
2. **Switch button** — symmetric: offline → cloud relies on `PostLoginMigrationDialog` post-login
3. **Migration wiring** — fill TODO in `usePostLoginMigration.ts` (`importCloudData`) and `doDisable()` (`exportCloudData` → `importLocalData`)
4. **Refactor** — flatten DataModeCard layers; `DataModeCard.tsx` + `index.ts`
5. **i18n** — `disableButton` → `switchButton`; new `signOut.*` keys
