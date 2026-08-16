# GYL Platform — Claude Code worker

A small Node.js script that runs on your Mac and dispatches `claude_jobs`
from the portal to your local Claude Code CLI.

## Why this exists

Heavy work (deep audits, competitor research, long-form drafts, design
generation) costs a lot if done via the Anthropic API. Running it through
your Claude Code subscription is effectively free.

The portal queues jobs in Postgres. This worker polls the queue, runs
each job locally, and posts results back.

## One-time setup

1. **Install Claude Code** on your Mac if you haven't already:
   <https://claude.com/docs/code>
2. **Generate a worker secret** at `http://localhost:3001/admin/agent/jobs`
   — click "Generate worker secret". Copy it (you only see it once).
3. **Start the worker** in a terminal you'll leave open:

   ```bash
   cd ~/Downloads/tool/gyl-platform
   GYL_PORTAL_URL=http://localhost:3001 \
   GYL_WORKER_SECRET=paste-your-secret-here \
   node worker/claude-worker.mjs
   ```

   You'll see:
   ```
   [worker] starting · workerId=you@your-mac · portal=http://localhost:3001
   [worker] polling every 30s · using claude
   ```

4. **Queue a test job** at `http://localhost:3001/admin/agent/jobs/new`.
   Watch your terminal — within 30 seconds you should see:
   ```
   [worker] claimed <id> — Audit a site (deep) (site_audit)
   [worker] done <id> in 420s
   ```
5. **Open the job in the portal** to see the Markdown output.

## Optional configuration

| Env var | Default | What it does |
|---|---|---|
| `GYL_WORKER_ID` | `$USER@$HOST` | Display name shown in the portal |
| `GYL_POLL_INTERVAL_MS` | `30000` | How often to poll when idle |
| `GYL_CLAUDE_BIN` | `claude` | Path to the `claude` CLI binary |
| `GYL_CLAUDE_MAX_TURNS` | `25` | Max tool-use turns per job |
| `GYL_CLAUDE_TIMEOUT_MS` | `1200000` | Per-job timeout (20 min default) |

## Running it persistently

For "always-on" without keeping a terminal open, use `launchd` on macOS.
A sample plist:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.aiwebfactory.claude-worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/walishah/Downloads/tool/gyl-platform/worker/claude-worker.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>GYL_PORTAL_URL</key><string>http://localhost:3001</string>
    <key>GYL_WORKER_SECRET</key><string>your-secret-here</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/gyl-claude-worker.log</string>
  <key>StandardErrorPath</key><string>/tmp/gyl-claude-worker.err.log</string>
</dict>
</plist>
```

Save as `~/Library/LaunchAgents/com.aiwebfactory.claude-worker.plist`
then `launchctl load ~/Library/LaunchAgents/com.aiwebfactory.claude-worker.plist`.

## How jobs flow

```
You queue a job
   ↓
portal DB row: status=pending
   ↓
worker polls /api/claude-jobs/claim
   ↓
portal returns the highest-priority pending job, sets status=claimed
   ↓
worker invokes `claude --print < prompt.txt`
   ↓
worker heartbeats /api/claude-jobs/<id>/heartbeat every 60s
   ↓
when claude exits, worker POSTs /api/claude-jobs/<id>/complete with the Markdown
   ↓
portal stores output, status=done — you see it in the UI
```

If the worker crashes mid-job, the portal reclaims the job after 5 min
of no heartbeats and any worker can pick it up again.

## Security notes

- Your secret authenticates **all** worker traffic. Rotate it any time
  via the portal — the old secret stops working immediately.
- The worker runs `claude` with your local subscription's permissions.
  Don't run it on a shared machine where you don't trust other users.
- The portal sends a prompt + minimal site context (name, slug, domain,
  city, region). It does NOT send your Anthropic API key or any
  customer-specific PII.
