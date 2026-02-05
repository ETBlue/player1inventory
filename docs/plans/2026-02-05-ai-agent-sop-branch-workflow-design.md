# AI Agent SOP Branch Workflow Design

**Date:** 2026-02-05

**Goal:** Establish clear branch workflow rules for brainstorming documentation and implementation work, ensuring clean repository management.

**Approach:** Integrate branch workflow guidance into the existing AI Agent SOP in CLAUDE.md, focusing on when to create branches, naming conventions, and cleanup procedures.

---

## Design

### 1. Branch Creation Workflow

**When to Create a Branch:**

After completing a brainstorming session and before documenting the results, create a new branch. This branch will contain all related work:
- The brainstorming log itself
- Any design documents produced
- Implementation plans
- The actual code implementation

The timing is important: create the branch after brainstorming is complete but before writing the design document. This keeps all related work isolated and makes it easy to review the complete feature or change in one PR.

**Branch Naming:**

Choose the branch prefix based on the primary purpose of the work:
- `docs/` - for documentation-heavy changes
- `feature/` - for new functionality
- `refactor/` - for code restructuring
- `chore/` - for maintenance tasks
- Other prefixes as appropriate to the mission

Use descriptive names: `docs/design-tokens`, `feature/dark-mode`, `refactor/component-extraction`

### 2. Branch Deletion and Cleanup

**After Merge:**

Always delete branches after their PR is merged. This keeps the repository clean and prevents confusion about which branches are active.

**Recommended approach:** Use the GitHub CLI to merge and delete in one command:
```bash
gh pr merge <number> --merge --delete-branch
```

This automatically deletes the remote branch after merging. Alternative approaches are fine as long as the branch gets deleted.

**Local cleanup:** After the remote branch is deleted, clean up your local repository:
```bash
git branch -d <branch-name>
```

If you're working in a git worktree, remove it as well:
```bash
git worktree remove <worktree-path>
```

### 3. Exceptions and Special Cases

**Minor Changes:**

For minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main. This applies to:
- Small bug fixes
- Typo corrections
- Simple configuration changes
- Other trivial updates

Quick documentation fixes (like fixing a typo in CLAUDE.md) can go directly to main without asking.

**General Rule:**

If the work involves brainstorming, design decisions, or implementation planning, it should go through the full branch workflow. If it's a quick fix or minor adjustment, check with the user about their preference.

## Integration into CLAUDE.md

This guidance will be added to the existing "AI Agent SOP" section under a "Workflow" subsection. The structure will be:

```markdown
## AI Agent SOP

### Workflow

**Branch Management:**

[Branch Creation Workflow content]

[Branch Deletion and Cleanup content]

[Exceptions and Special Cases content]
```

The guidance integrates naturally with existing workflow documentation and provides clear, actionable rules for branch management throughout the development process.

## Benefits

1. **Clear Process** - Developers know exactly when to create branches
2. **Complete Context** - All related work stays together in one branch
3. **Clean Repository** - Automatic cleanup prevents branch sprawl
4. **Flexibility** - Exceptions handle quick fixes appropriately
5. **Easy Review** - Complete features can be reviewed in single PRs
