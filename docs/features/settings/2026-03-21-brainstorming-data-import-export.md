# Brainstorming Log: Data Import/Export (Both Modes)

**Date:** 2026-03-21

## Questions & Answers

**Q: What triggered this feature?**
A: User confirmed all local IndexedDB operations are fully migrated to cloud. Planning to focus on cloud-only features. Import/export parity is the first cloud-only feature.

**Q: Should exported files match local mode format?**
A: Yes — same `ExportPayload` format for both local and cloud exports.

**Q: For cloud export, should we add "fetch all" queries for logs/carts/cart items?**
A: Yes, add those queries. Full data parity in export.

**Q: Where does cloud import write data?**
A: To the cloud backend via bulk-insert GraphQL mutations (Option A).

**Q: What's the conflict strategy?**
A: Ask user. Show where conflicts come from (by ID and by name, grouped by entity type).

**Q: Does local mode also get import?**
A: Yes — backup tool for both modes. Also supports migration between local and cloud.

**Q: UI placement?**
A: Separate cards — ExportCard and ImportCard, shown in both modes.

**Q: Do bulk-insert GraphQL mutations exist on the server?**
A: No — need to add them to the GraphQL schema and server implementation.

**Q: Conflict detection key?**
A: Both ID and name — show user which entities conflict under each criterion.

**Q: How many actions in the conflict dialog?**
A: Three:
1. **Skip conflicts** — import only non-conflicting entities; keep existing intact
2. **Replace matches** — overwrite conflicting entities; keep non-conflicting existing data
3. **Clear & import** — wipe all existing data first, then import everything

## Final Design Decisions

- `ExportPayload` format unchanged — same for both modes
- Cloud export: 3 new Apollo "fetch all" queries needed
- Cloud import: 8 new bulk-insert GraphQL mutations (server + client)
- Local import: new `importLocalData(payload)` using Dexie operations
- Conflict dialog: 3 actions with per-entity-type conflict summary (name + ID matches shown)
- Settings: ExportCard shown in both modes; new ImportCard in both modes
