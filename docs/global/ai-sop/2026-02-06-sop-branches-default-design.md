# AI Agent SOP: Use Branches Over Worktrees (Default)

**Date:** 2026-02-06

**Goal:** Update AI Agent SOP to recommend regular git branches as the default workflow (compatible with GitHub Desktop), while preserving git worktrees as an advanced option for CLI users.

**Rationale:** Git worktrees are not yet supported in GitHub Desktop, making them inaccessible to GUI users. Regular branches work with all tools (GitHub Desktop, VS Code, CLI) and should be the default recommendation.

---

## Design

### 1. Overall Changes

**Removals:**
- Standalone "Worktrees" section (currently lines 130-132 in CLAUDE.md)

**Updates:**
- Branch Management section: Add default recommendation for regular branches
- Branch Cleanup section: Reorder to show branch cleanup first, worktree cleanup as conditional
- New subsection: "Advanced: Git Worktrees" for CLI power users

**Principles:**
- Accessibility first - default to tools that work everywhere
- Preserve power user options - keep worktrees available
- Minimal git teaching - assume users know their tools
- Clear hierarchy - obvious what's recommended vs. optional

### 2. Branch Management Section

**Location:** AI Agent SOP → Workflow → Branch Management

**Updated Content:**

```markdown
**Branch Management:**

After completing a brainstorming session and before documenting the results, create a new branch. This branch will contain all related work:
- The brainstorming log itself
- Any design documents produced
- Implementation plans
- The actual code implementation

The timing is important: create the branch after brainstorming is complete but before writing the design document. This keeps all related work isolated and makes it easy to review the complete feature or change in one PR.

**Recommended Approach: Regular Branches**

Use regular git branches for feature work. This approach works with all git tools including GitHub Desktop, VS Code, and CLI.

**Advanced Alternative: Git Worktrees**

CLI users may optionally use git worktrees for parallel work isolation. Create worktrees in `.worktrees/` directory (project-local, hidden). See "Advanced: Git Worktrees" section below for details.
```

**Key Points:**
- Emphasizes branches as recommended approach
- Explicitly mentions GitHub Desktop compatibility
- Keeps worktree option visible but marked as advanced
- Preserves existing timing and content guidance

### 3. Branch Cleanup Section

**Location:** AI Agent SOP → Workflow → Branch Cleanup

**Updated Content:**

```markdown
**Branch Cleanup:**

Always delete branches after their PR is merged. This keeps the repository clean and prevents confusion about which branches are active.

Recommended approach using GitHub CLI:
```bash
gh pr merge <number> --merge --delete-branch
```

This automatically deletes the remote branch after merging. Alternative approaches are fine as long as the branch gets deleted.

Local cleanup after the remote branch is deleted:
```bash
git branch -d <branch-name>
```

If using git worktrees, also remove the worktree:
```bash
git worktree remove <worktree-path>
```
```

**Key Points:**
- Primary focus on `git branch -d`
- Worktree cleanup shown as conditional ("If using git worktrees")
- Same gh CLI recommendation preserved
- Clear primary vs. secondary cleanup paths

### 4. Advanced: Git Worktrees Section

**Location:** AI Agent SOP → Workflow → Advanced: Git Worktrees (new subsection)

**New Content:**

```markdown
**Advanced: Git Worktrees**

For CLI users who want to work on multiple branches simultaneously without switching, git worktrees provide isolated workspaces.

**Setup:**
```bash
# Create worktree in .worktrees/ directory
git worktree add .worktrees/<branch-name> -b <branch-name>
cd .worktrees/<branch-name>
```

**Directory Convention:**
Use `.worktrees/` directory for git worktrees (project-local, hidden). Ensure it's in `.gitignore`.

**Cleanup:**
```bash
# After branch is merged and deleted
git worktree remove .worktrees/<branch-name>
```

**Note:** Git worktrees are not supported in GitHub Desktop. If you use GUI tools, stick with regular branches.
```

**Key Points:**
- Provides just enough information for CLI users
- Preserves `.worktrees/` directory convention
- Explicit GitHub Desktop incompatibility warning
- Minimal commands, relies on git knowledge
- Clearly marked as advanced/optional

### 5. Complete Structure

**Final AI Agent SOP → Workflow section:**

```
### Workflow

**Branch Management:**
  - Timing guidance (when to create branch)
  - Recommended Approach: Regular Branches
  - Advanced Alternative: Git Worktrees (brief mention)

**Branch Naming:**
  - [No changes to existing content]

**Branch Cleanup:**
  - gh pr merge command
  - git branch -d (primary)
  - git worktree remove (if using worktrees)

**Exceptions:**
  - [No changes to existing content]

**General Rule:**
  - [No changes to existing content]

**Advanced: Git Worktrees** (new subsection)
  - Setup commands
  - Directory convention
  - Cleanup commands
  - GitHub Desktop compatibility note
```

## Benefits

1. **Accessible Default** - All users can follow the SOP regardless of tools
2. **GitHub Desktop Compatible** - GUI users aren't blocked by worktree limitations
3. **Power User Option Preserved** - CLI users can still use worktrees if desired
4. **Clear Guidance** - Obvious what's recommended vs. advanced
5. **Tool Flexibility** - Works with GitHub Desktop, VS Code, CLI, etc.

## Implementation

This is a documentation-only change to CLAUDE.md:
1. Remove standalone "Worktrees" section (lines 130-132)
2. Update "Branch Management" section with new content
3. Update "Branch Cleanup" section with reordered commands
4. Add new "Advanced: Git Worktrees" subsection at end of Workflow

No code changes required.
