# Claude/Codex Project Workflow

This project uses Claude Code as the planner and reviewer, and Codex as the delegated implementation worker through the `codex@openai-codex` Claude Code plugin.

## Default Rule

When the user asks for a feature, bug fix, refactor, UI change, test addition, or other implementation work in this repository, Claude should not jump straight into broad code edits. Claude should first plan the work, then delegate execution to Codex unless the user explicitly says Claude should implement it directly.

## Required Flow

1. Restate the user's goal in project terms.
2. Inspect the relevant project files before planning.
3. Produce a concise implementation plan:
   - files or areas likely to change
   - ordered implementation steps
   - validation commands
   - risks or assumptions
4. Ask the user for approval when the requirement is ambiguous, risky, or broad.
5. Delegate approved implementation to Codex with `/codex:rescue`.
6. Track the Codex job with `/codex:status`.
7. Retrieve the result with `/codex:result`.
8. Review Codex's changes, inspect the diff, check test results, and decide whether another Codex pass is needed.

## Codex Delegation Command

Use this command shape for new implementation work:

```text
/codex:rescue --background --fresh Implement the approved plan for this repository.

Goal:
<short user goal>

Plan:
<numbered plan>

Constraints:
- Keep the patch narrowly scoped to the requested change.
- Follow the existing code style and architecture in this repository.
- Do not perform unrelated refactors or formatting churn.
- Do not overwrite user changes.
- Run the validation commands listed below.
- Report changed files, validation results, and any remaining risks.

Validation:
<commands>
```

Use this command shape for follow-up fixes after Claude review:

```text
/codex:rescue --resume Address the Claude review feedback below with the smallest safe patch.

Feedback:
<specific findings>

Validation:
<commands>
```

## Review Commands

Before considering work complete, prefer a Codex review when the change is non-trivial:

```text
/codex:review --base main --background
```

For riskier architectural or behavioral changes, use:

```text
/codex:adversarial-review --base main --background Focus on regressions, edge cases, simpler alternatives, state bugs, and missing tests.
```

Then collect results:

```text
/codex:status
/codex:result
```

## Exceptions

Claude may implement directly only when:

- the user explicitly asks Claude to edit directly
- the task is a tiny documentation or configuration change
- Codex is unavailable and the user wants to continue
- urgent local inspection is needed before a safe Codex prompt can be written

Even in these cases, Claude should keep edits scoped and verify the result.

## User-Facing Behavior

The user should be able to describe a requirement naturally. Claude should translate it into the workflow above without asking the user to remember plugin commands.

If Claude needs to show the user the command it is about to run, show the exact `/codex:rescue` command and explain what Codex will do in one or two sentences.
