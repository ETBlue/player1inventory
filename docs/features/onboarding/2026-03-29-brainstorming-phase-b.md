# Phase B Brainstorming Log

**Date:** 2026-03-29
**Topic:** Template data structure and Phase B scope decisions

---

## Questions & Answers

**Q: What tag structure should the template use?**
A: Mirror the user's actual backup (`player1inventory-backup-2026-03-29.json`). Two tag types:
- `category` (lime, hierarchical)
- `preservation` (cyan, flat)

Merge `vegetables-Leafy`, `vegetables-fruit`, `vegetables-Root`, `vegetables-Stem` → single `vegetables` tag under `produce`.

Skip `nutrition` (too personal), `Supplements`, `Pandemic prevention`, `Emergency supplies` (too niche).

**Final category hierarchy:**
```
Food & Dining
  produce
    meat · vegetables · Fruits · mushrooms
  grains · seasonings · Drinks · snacks · Sweets · prepared · cooked
Health & Beauty
  cleansing · personal care · Oral health
household
  cleaning & sanitizing · kitchen supplies
```

**Q: How many template items?**
A: ~20 common Taiwanese pantry staples. No specific list required — pick reasonable ones matching the tag structure above.

**Q: Include "Import backup" on welcome screen?**
A: No — skip for Phase B. Document as a future feature in the design doc. Welcome screen has only two options: Choose from template, Start from scratch.

**Q: Should `useOnboardingSetup` support dual mode?**
A: Yes — both local (Dexie operations) and cloud (Apollo mutations).

**Q: Vendor list?**
A: Plan's 17 vendors + add TW online platforms from user's backup: Momo 商城 and PChome 線上購物. Total: 19 vendors.

---

## Final Decisions

| Decision | Value |
|----------|-------|
| Tag types | `category` (lime) + `preservation` (cyan) |
| vegetables tags | merged into single `vegetables` under `produce` |
| Template items | ~20 common TW staples |
| Import backup on welcome | deferred — document only |
| `useOnboardingSetup` mode | dual (local + cloud) |
| Vendor count | 19 (17 from plan + Momo + PChome) |
