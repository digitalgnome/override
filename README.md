# Override: Decky Loader plugin

Pick a game, download its cheat pack from an online store, and toggle cheats or
set values (like Gil) from the Steam Deck's Quick Access menu.

- **My Cheats**: shows cheats for the running game (or pick any installed game).
  Value cheats show the current in-game value; tap it to type a new one.
- **Get Cheats**: search the online store and download, update or open packs.

Cheats are written into the game's memory through `/proc/<pid>/mem`. Use them in
single-player games only.

## Available cheats

| Game | Cheats |
|---|---|
| Final Fantasy Resonance | Set Gil (0 – 9,999,999) |

## Project layout

```
override/
├── src/                  # React/TypeScript frontend (Quick Access panel)
├── main.py               # Python backend (store, downloads, cheat states)
├── py_modules/cheatmem.py# Game-memory reading/writing + pointer chains
├── store/                # ← the ONLINE store, served from GitHub
│   ├── index.json        #   generated, do not edit by hand
│   └── packs/*.json      #   one cheat pack per game
├── defaults/             # offline copy of the store bundled in the plugin (generated)
├── examples/packs/       # unfinished packs (no memory addresses yet)
├── tools/build_store.py  # validates packs, rebuilds store/index.json + defaults/
├── deploy.sh             # build + install on your Deck
├── diagnose.sh           # collect logs from the Deck
├── plugin.json           # Decky metadata (api_version 1, root flag)
└── package.json
```

## How the online store works

The plugin downloads
`https://raw.githubusercontent.com/digitalgnome/override/main/store/index.json`
(cached for 5 minutes) and each pack from `store/packs/` the same way. If the
Deck is offline, it uses the copy bundled in `defaults/`.

### Publishing a new or updated cheat pack

1. Create or edit `store/packs/<id>.json` (the file name must equal the pack `id`).
   When updating, bump `"version"` so users see **Update**.
2. Run `python3 tools/build_store.py`. It validates the packs (rejects cheats
   without addresses) and regenerates `store/index.json` and `defaults/`.
3. Commit and push:
   ```bash
   git add store defaults
   git commit -m "Add <game> cheats"
   git push
   ```
   Within ~5 minutes the pack appears in **Get Cheats** (tap *Refresh store*).

## Cheat pack format

```json
{
  "id": "final-fantasy-resonance-cheats",
  "gameName": "Final Fantasy Resonance",
  "steamAppId": "3259780",
  "version": "1.0.0",
  "author": "digitalgnome",
  "description": "Set your Gil.",
  "cheats": [
    {
      "id": "set-gil", "name": "Set Gil", "description": "Sets your Gil.",
      "type": "value", "valueType": "integer",
      "defaultValue": 99999, "min": 0, "max": 9999999, "step": 1000,
      "addresses": [{ "size": 4, "pointers": [
        "FFRS-Win64-Shipping.exe+0x9A6F220 -> 0x7b8 -> 0x60 -> 0x28",
        "FFRS-Win64-Shipping.exe+0x9F9E500 -> 0x338 -> 0x200 -> 0x28"
      ]}]
    },
    {
      "id": "god-mode", "name": "God Mode", "description": "…", "type": "toggle",
      "addresses": [{ "size": 4, "pointers": ["Game.exe+0x1234 -> 0x10"],
                      "enabledValue": [1,0,0,0], "disabledValue": [0,0,0,0] }]
    }
  ]
}
```

- `type: "toggle"` writes `enabledValue` / `disabledValue` bytes.
- `type: "value"` writes the user's number, encoded by `valueType` (`integer`:
  signed little-endian of `size` bytes, `float`: float32, or float64 when `size` is 8).
  Ranges larger than 500 steps get a typed input. Smaller ones get a slider.
- `pointers` use PINCE / Cheat Engine notation. All chains are resolved, and the
  address most of them agree on wins. Its current value must be within
  `min`/`max` (or `validMin`/`validMax`), or nothing is written. Include several
  chains from different bases.
- `offset` (`"0x39fd8128"`) is a fixed address. It only works if the value never moves.

### Finding addresses (PINCE)

1. Run the game, start PINCE with `sudo`, and attach to the **GameThread**
   process (Proton shows the game's `*-Shipping.exe` under that name).
2. Scan for the exact value (try Int32 first), change it in game, then **Next Scan**
   until 1 to 3 results remain. Confirm by editing it.
3. Pointer-scan that address, restart the game, find it again and rescan/filter.
   Keep chains that survive several restarts and area changes.
4. Test on the Deck before publishing:
   ```bash
   sudo python3 ~/homebrew/plugins/override/py_modules/cheatmem.py \
     ~/homebrew/plugins/override/defaults/packs/<pack>.json <cheat-id> [value]
   ```
   Without a value it only reads, and lists which chains resolve.

## Development

Requires Node.js 20+ and pnpm.

```bash
pnpm i
pnpm build                 # or: node_modules/.bin/rollup -c rollup.config.js
```

Deploying to your Deck (SSH enabled, `passwd` set):

```bash
echo deck@<DECK_IP> > .deck-target   # once; git-ignored
./deploy.sh                          # build, copy, install, restart Decky
./diagnose.sh                        # if something breaks: files + logs → diagnose-output.txt
```

Run `ssh-copy-id deck@<DECK_IP>` once to skip the SSH password prompt.

Backend logs on the Deck: `~/homebrew/logs/override/`.
