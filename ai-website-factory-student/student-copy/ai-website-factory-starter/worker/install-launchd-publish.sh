#!/usr/bin/env bash
# Install a launchd LaunchAgent on Wali's Mac that runs publish-plugin nightly.
#
# Run once: `bash worker/install-launchd-publish.sh`
#
# After this lands, the flow is fully hands-free:
#   1. You bump the plugin's Version: header in gyl-bookings.php and commit.
#   2. At 04:00 local time, launchd runs publish-plugin.
#   3. publish-plugin builds the zip from source, compares its version to
#      ~/.config/gyl/last-published-version, and (if newer) queues a
#      fix:plugin_upgrade job for every site.
#   4. The Mac worker (already running, see install-launchd.sh) drains the
#      queue and pushes via the plugin's HMAC self-update endpoint.
#
# Nothing for you to upload, ever. No zips to drag.
#
# To stop:   launchctl bootout gui/$(id -u)/com.aiwebfactory.pluginpublish
# To run now: launchctl kickstart -k gui/$(id -u)/com.aiwebfactory.pluginpublish
# To check:  launchctl print gui/$(id -u)/com.aiwebfactory.pluginpublish

set -euo pipefail

LABEL="com.aiwebfactory.pluginpublish"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO/.env"
NODE_BIN="$(command -v node || echo /usr/local/bin/node)"
NPM_BIN="$(command -v npm  || echo /usr/local/bin/npm)"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
PLIST="$LAUNCHD_DIR/$LABEL.plist"
LOG_DIR="$REPO/.data/publish-logs"

if [ ! -f "$ENV_FILE" ]; then
  echo "FATAL: $ENV_FILE not found — publish-plugin needs DB creds in .env"
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
    <string>$NPM_BIN</string>
    <string>run</string>
    <string>plugin:publish</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>4</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG_DIR/publish.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/publish.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
</dict>
</plist>
PLIST

# Reload to pick up plist changes.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Installed nightly publish-plugin LaunchAgent: $LABEL"
echo "It will fire every day at 04:00 local."
echo "First publish is idempotent — if v$(grep -E '^\s*\*\s*Version:' "$REPO/wp-plugin/gyl-bookings/gyl-bookings.php" | head -1 | awk '{print $3}') is already recorded as last published, it exits silently."
echo "To run a publish RIGHT NOW: launchctl kickstart -k gui/$(id -u)/$LABEL"
