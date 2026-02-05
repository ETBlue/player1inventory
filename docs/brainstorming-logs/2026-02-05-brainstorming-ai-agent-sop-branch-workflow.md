# Brainstorming: AI Agent SOP Branch Workflow

**Date:** 2026-02-05

**Topic:** Update AI Agent SOP with branch workflow rules for brainstorming documentation and implementation work

## Context

After completing the design tokens implementation, we identified the need to formalize when and how to create branches for brainstorming work, and ensure merged branches are always cleaned up.

## Questions and Decisions

### Q1: When should the branch be created?
**Answer:** Before writing design doc (after brainstorming is complete)

Create the branch after brainstorming session completes but before documenting results. This ensures all related work is isolated in one branch.

### Q2: What should the branch contain?
**Answer:** Everything - brainstorming log + design doc + implementation plan + actual code

The branch serves as a complete container for the entire feature or change, from initial brainstorming through final implementation.

### Q3: Branch naming conventions?
**Answer:** Context-dependent with flexibility for refactor/, chore/, or other prefixes

- `docs/` - documentation-heavy changes
- `feature/` - new functionality
- `refactor/` - code restructuring
- `chore/` - maintenance tasks
- Other prefixes as appropriate to the mission

### Q4: When should merged branches be deleted?
**Answer:** Automatically during merge (using `gh pr merge --delete-branch`)

Recommended command: `gh pr merge <number> --merge --delete-branch`
This keeps the repository clean and prevents confusion about active branches.

### Q5: Are there any exceptions?
**Answer:** Yes - quick documentation fixes and minor trivial stuff

- Quick documentation fixes can go directly to main
- For other minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main

### Q6: How should this be structured in CLAUDE.md?
**Answer:** Integrate into existing sections under "Workflow" subsection in AI Agent SOP

Keep it integrated rather than as a separate section or duplicated across multiple locations.

### Q7: How to phrase the exception for minor changes?
**Answer:** "For minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main"

Clear and flexible without needing to define rigid criteria.

### Q8: Should the SOP specify the exact command?
**Answer:** Provide the command as a recommendation but allow alternatives

Include `gh pr merge <number> --merge --delete-branch` as the recommended approach while allowing flexibility.

### Q9: Should we reference the finishing-a-development-branch skill?
**Answer:** No, keep it as general branch workflow guidance

Avoid coupling the SOP to specific skill names.

## Final Design

The branch workflow will be integrated into CLAUDE.md's AI Agent SOP with three main components:

1. **Branch Creation Workflow** - When and how to create branches after brainstorming
2. **Branch Deletion and Cleanup** - Auto-delete during merge with recommended commands
3. **Exceptions and Special Cases** - Quick fixes and minor changes can skip the branch workflow

See `docs/plans/2026-02-05-ai-agent-sop-branch-workflow-design.md` for the complete design document.
