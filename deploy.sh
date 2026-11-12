#!/usr/bin/env bash
# Build the plugin and install it on the Steam Deck.
#   ./deploy.sh                    (Deck address from .deck-target)
#   DECK=deck@1.2.3.4 ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"
# Deck address: $DECK, else the git-ignored .deck-target file (e.g. deck@192.168.1.50)
DECK="${DECK:-$(cat .deck-target 2>/dev/null)}"
if [ -z "$DECK" ]; then
  echo "Set your Deck address first:  echo deck@<DECK_IP> > .deck-target" >&2
  exit 1
fi

echo "==> Building frontend"
node_modules/.bin/rollup -c rollup.config.js

echo "==> Copying to $DECK"
rsync -az --delete --exclude node_modules --exclude src --exclude .git --exclude store --exclude examples --exclude tools --exclude .deck-target --exclude diagnose-output.txt . "$DECK:~/override/"

echo "==> Installing and restarting Decky (enter the Deck password if asked)"
# (also removes the plugin's old name, cheat-code, if it's still installed)
ssh -t "$DECK" 'sudo rm -rf ~/homebrew/plugins/override ~/homebrew/plugins/cheat-code ~/cheat-code \
  && sudo cp -r ~/override ~/homebrew/plugins/ \
  && sudo systemctl restart plugin_loader'

echo "==> Done. Open ... > Override on the Deck."
