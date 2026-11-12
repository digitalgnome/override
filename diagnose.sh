#!/usr/bin/env bash
# Collect what's needed to debug the plugin on the Deck.
#   ./diagnose.sh   -> prints it and saves diagnose-output.txt next to this script
set -uo pipefail

cd "$(dirname "$0")"
# Deck address: $DECK, else the git-ignored .deck-target file (e.g. deck@192.168.1.50)
DECK="${DECK:-$(cat .deck-target 2>/dev/null)}"
if [ -z "$DECK" ]; then
  echo "Set your Deck address first:  echo deck@<DECK_IP> > .deck-target" >&2
  exit 1
fi
OUT=diagnose-output.txt
REMOTE_SCRIPT=$(mktemp)

cat > "$REMOTE_SCRIPT" <<'EOF'
P=/home/deck/homebrew/plugins/override
S=/home/deck/homebrew/settings/override
echo "=== installed files"
ls -la "$P" "$P/defaults" "$P/defaults/packs" "$P/dist" "$P/py_modules" 2>&1
echo "=== plugin.json"; cat "$P/plugin.json"
echo "=== games in installed store index"
python3 -c "import json;[print(' ',e['id'],e['version']) for e in json.load(open('$P/defaults/store-index.json'))['entries']]" 2>&1
echo "=== frontend build has search dialog? (expect > 0)"
grep -c "Search cheats" "$P/dist/index.js"
echo "=== downloaded packs"; ls -la "$S/packs" 2>&1
echo "=== plugin log (last 80 lines)"
tail -n 80 "$(ls -t /home/deck/homebrew/logs/override/*.log 2>/dev/null | head -1)" 2>&1
echo "=== decky loader log (cheat/error lines, last 30 min)"
journalctl -u plugin_loader --since "-30 min" --no-pager 2>/dev/null | grep -i -A 12 "Override.*failed" | tail -n 60
EOF

echo "==> Copying check script to the Deck (Deck password if asked)"
scp -q "$REMOTE_SCRIPT" "$DECK:/tmp/override-diagnose.sh"
rm -f "$REMOTE_SCRIPT"

echo "==> Running it (Deck password again for sudo)"
ssh -t "$DECK" 'sudo bash /tmp/override-diagnose.sh; rm -f /tmp/override-diagnose.sh' | tee "$OUT"

echo
echo "Saved to $(pwd)/$OUT"
