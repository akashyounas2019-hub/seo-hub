# AGENTS.md — SEO RankPilot

This file exists so agents (Codex, Copilot, Cursor, and other AI tooling) can find operational context under the filename they look for by convention.

**Everything below lives in [CLAUDE.md](./CLAUDE.md). Read that file — it is the single source of truth.**

Duplicating the contents here would guarantee drift. The two files were previously kept in sync manually; they had already diverged (one referenced "Wali", "Codex", "Codex-worker.mjs"; the other referenced "AKS", "Claude Code", "claude-worker.mjs" — the actual filenames). One-file source of truth avoids that class of bug.

## Minimum you need to know before writing code

Read the top of `CLAUDE.md` — the sections **"What this project is"**, **"Niche context"**, and **"Hard constraints"** are non-negotiable and short. If you produce code without reading those, you will produce wrong code.

Three of the most common mistakes an AI assistant makes on this repo:

1. **Generating limo/taxi/chauffeur content.** The previous vertical was a Toronto limo network. Any AI output referencing limos, chauffeurs, airport transfers, Toronto, Ontario, or GTA is wrong. The current niche is Dubai cleaning services.
2. **Defaulting to `America/Toronto` or `Canada`.** New code should default to `Asia/Dubai` and country code `AE` / `United Arab Emirates`.
3. **Using Anthropic API when the job should route to the AKS Mac worker.** See the "Worker routing" section of CLAUDE.md. Default `preferWorker: "mac"` on `claude_jobs` rows for anything long-running.
</content>
</invoke>