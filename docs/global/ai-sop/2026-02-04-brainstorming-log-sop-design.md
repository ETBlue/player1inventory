# Brainstorming Log SOP Design

**Goal:** Establish SOP for creating brainstorming logs when decisions are made.

**Status:** Implemented

---

## When to Create

Create brainstorming logs when brainstorming leads to implementation/design decisions.

**Not needed for:**
- Exploratory discussions without decisions
- Simple questions with obvious answers
- Quick clarifications

---

## File Format

**Location:** `docs/brainstorming-logs/`

**Naming:** `YYYY-MM-DD-brainstorming-<topic>.md`
- Date: Session date (when brainstorming occurred)
- Topic: Brief description (kebab-case)

**Examples:**
- `2026-02-04-brainstorming-pnpm-migration.md`
- `2026-02-04-brainstorming-ai-agent-sop.md`

---

## Content Structure

```markdown
# Brainstorming Log: <Topic>

**Date:** YYYY-MM-DD

**Goal:** <What was being explored>

---

## Q&A

**Q1: <question>**
- Options: <list>
- Answer: <user's choice>
- Rationale: <why this option>

**Q2: <question>**
...

---

## Decision

<Final decision/recommendation with summary of trade-offs>
```

---

## Implementation

1. **Update CLAUDE.md** - Add brainstorming log section to AI Agent SOP
2. **Rename existing logs** - Add date prefix to all 7 existing logs using git history dates
3. **Apply to future sessions** - All agents follow this format going forward

---

## Changes Made

**Renamed files:**
- `brainstorming-log.md` → `2026-02-03-brainstorming-initial-design.md`
- `brainstorming-log-tag-improvements.md` → `2026-02-03-brainstorming-tag-improvements.md`
- `brainstorming-log-ai-agent-sop.md` → `2026-02-04-brainstorming-ai-agent-sop.md`
- `brainstorming-log-coding-standards.md` → `2026-02-04-brainstorming-coding-standards.md`
- `brainstorming-log-component-extraction.md` → `2026-02-04-brainstorming-component-extraction.md`
- `brainstorming-log-pnpm-migration.md` → `2026-02-04-brainstorming-pnpm-migration.md`
- `brainstorming-log-storybook-setup.md` → `2026-02-04-brainstorming-storybook-setup.md`

**Updated:** CLAUDE.md AI Agent SOP section
