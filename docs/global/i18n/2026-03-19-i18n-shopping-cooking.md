# i18n: Shopping & Cooking Pages — Brainstorming Log

Date: 2026-03-19

## Questions & Answers

**Q1: Scope for shared components**
Should `ItemListToolbar` and `CookingControlBar` be translated now?

**A:** Translate `CookingControlBar` in this plan (used only in cooking page). Leave `ItemListToolbar` to the next plan (item list pages).

---

**Q2: Pluralization strategy**
Several strings use inline JS ternaries. Should we use i18next built-in plurals?

**A:** Yes, use i18next plurals (`t('key', { count })` → `key_one` / `key_other`).

---

**Q3: Auto-generated log notes**
Cooking and shopping checkout generate note strings stored in the log. Should these be translated?

**A:** Yes, translate log notes.

---

**Q4: Aria-labels**
Should accessibility attributes be translated?

**A:** Yes, translate aria-labels too.

---

**Q5: Cooking "done" dialog title — plural form**
Singular uses recipe name (`"Consume from Pasta recipe?"`). Should plural use count (`"Consume from 3 recipes?"`) or joined names (`"Consume from Pasta, Salad recipes?"`)?

**A:** Use joined name string for both singular and plural. The `count` still drives plural selection (for the word "recipe" vs "recipes"), but both forms interpolate `{{names}}`.

## Decision

Design both `shopping.*` and `cooking.*` + `cookingControlBar.*` key namespaces. Add `common.done`, `common.back`, and `common.confirm` for shared action labels. Use i18next plurals throughout. Translate log note strings and aria-labels.
