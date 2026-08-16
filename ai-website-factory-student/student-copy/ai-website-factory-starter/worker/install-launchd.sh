#!/usr/bin/env bash
# Install the Mac Claude Code worker as a launchd LaunchAgent so it auto-starts
# when you log in + restarts on crash. Run once after setting up .env.worker.
#
# Usage: bash worker/install-launchd.sh
#
# To stop:   launchctl bootout gui/$(id -u)/com.aiwebfactory.claudeworker
# To start:  launchctl bootstrap gui/$(id -u)/<plist>
# To check:  launchctl print gui/$(id -u)/com.aiwebfactory.claudeworker

set -euo pipefail

LABEL="com.aiwebfactory.claudeworker"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO/.env.worker"
NODE_BIN="$(command -v node || echo /usr/local/bin/node)"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
PLIST="$LAUNCHD_DIR/$LABEL.plist"
LOG_DIR="$REPO/.data/worker-logs"

if [ ! -f "$ENV_FILE" ]; then
  echo "FATAL: $ENV_FILE not found"
  echo "Create it with:"
  echo "  GYL_PORTAL_URL=http://localhost:3001"
  echo "  GYL_WORKER_SECRET=<paste from /admin/agent/jobs/secret>"
  echo "  GYL_CLAUDE_BIN=$(command -v claude || echo claude)"
  echo "  GYL_CLAUDE_MAX_TURNS=25"
  exit 1
fi
if ! command -v claude >/dev/null; then
  echo "FATAL: 'claude' CLI not on PATH. Install Claude Code first."
  exit 1
fi

mkdir -p "$LAUNCHD_DIR" "$LOG_DIR"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--env-file=$ENV_FILE</string>
    <string>$REPO/worker/claude-worker.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/worker.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/worker.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "✓ Installed $LABEL"
echo "  Plist: $PLIST"
echo "  Logs:  $LOG_DIR/worker.{out,err}.log"
echo ""
echo "Status:"
launchctl print "gui/$(id -u)/$LABEL" 2>&1 | grep -E "state|pid|last exit" | head -5 || true
