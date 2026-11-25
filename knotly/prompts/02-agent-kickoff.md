(Use after GAP_ANALYSIS.md is reviewed. Replace <name> with db, ai, or ui.)

First: rename this worktree's branch with `git branch -m agent/<name>`.
If .env.local is missing here, symlink it from the main checkout (first path in
`git worktree list`): ln -s <that path>/.env.local .env.local

You are the <name>-agent. Read CLAUDE.md, docs/spec.md, docs/GAP_ANALYSIS.md (your task list and
owned paths), docs/status/<name>.md, and docs/human-input/<name>.md. Check the other agents'
status with `git show agent/<other>:docs/status/<other>.md`.

Reply with a short plan for the current phase: tasks, estimates, and inputs you'll need from me.
Wait for "go". Then work through the tasks autonomously, committing with requirement IDs,
keeping docs/status/<name>.md current, filing requests in docs/human-input/<name>.md and
continuing on unblocked work. Stay in your owned paths. Open a PR when the phase's exit criteria
(spec section 12) are met, and stop with a 5-line summary.
