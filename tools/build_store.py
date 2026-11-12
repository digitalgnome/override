#!/usr/bin/env python3
"""
Rebuild the cheat store from store/packs/*.json.

    python3 tools/build_store.py

- Validates every pack (same rules as the plugin backend).
- Writes store/index.json (what the plugin downloads from GitHub).
- Copies index + packs into defaults/ (the offline fallback bundled with
  the plugin).

To publish a new or updated pack: put it in store/packs/, bump its
"version", run this script, then commit and push.
"""
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

GITHUB_USER = "digitalgnome"
REPO = "override"
BRANCH = "main"
RAW = f"https://raw.githubusercontent.com/{GITHUB_USER}/{REPO}/{BRANCH}/store/packs"

ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / "store"
DEFAULTS = ROOT / "defaults"
SAFE_ID = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$")
CHAIN = re.compile(r"^\s*[^+]+\+0x[0-9a-fA-F]+(\s*->\s*-?0x[0-9a-fA-F]+)*\s*$")


def check(pack: dict, fname: str) -> list[str]:
    errs = []
    pid = pack.get("id", "")
    if pid != Path(fname).stem:
        errs.append(f"id '{pid}' must match file name '{Path(fname).stem}'")
    if not SAFE_ID.match(pid):
        errs.append(f"id '{pid}' may only use letters, digits, - _ .")
    for key in ("gameName", "steamAppId", "version", "author", "description"):
        if not pack.get(key):
            errs.append(f"missing '{key}'")
    if not str(pack.get("steamAppId", "")).isdigit():
        errs.append("steamAppId must be digits")
    cheats = pack.get("cheats")
    if not isinstance(cheats, list) or not cheats:
        return errs + ["needs a non-empty 'cheats' list"]
    ids = set()
    for c in cheats:
        cid = c.get("id", "?")
        if cid in ids:
            errs.append(f"duplicate cheat id '{cid}'")
        ids.add(cid)
        if c.get("type") not in ("toggle", "value"):
            errs.append(f"{cid}: type must be 'toggle' or 'value'")
        if not c.get("addresses"):
            errs.append(f"{cid}: no 'addresses' (cheat would do nothing)")
        for a in c.get("addresses") or []:
            for chain in a.get("pointers") or []:
                if not CHAIN.match(chain):
                    errs.append(f"{cid}: bad pointer chain '{chain}'")
            if "offset" not in a and not a.get("pointers"):
                errs.append(f"{cid}: address needs 'offset' or 'pointers'")
    return errs


def main() -> int:
    entries, failed = [], False
    pack_files = sorted((STORE / "packs").glob("*.json"))
    for f in pack_files:
        try:
            pack = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            print(f"✗ {f.name}: invalid JSON: {e}")
            failed = True
            continue
        errs = check(pack, f.name)
        if errs:
            failed = True
            print(f"✗ {f.name}")
            for e in errs:
                print(f"    - {e}")
            continue
        entries.append({
            "id": pack["id"],
            "gameName": pack["gameName"],
            "steamAppId": str(pack["steamAppId"]),
            "author": pack["author"],
            "description": pack["description"],
            "version": pack["version"],
            "downloadUrl": f"{RAW}/{f.name}",
            "cheatCount": len(pack["cheats"]),
        })
        print(f"✓ {f.name}  v{pack['version']}  ({len(pack['cheats'])} cheats)")

    if failed:
        print("\nFix the errors above; nothing was written.")
        return 1

    entries.sort(key=lambda e: e["gameName"].lower())
    index = {
        "entries": entries,
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (STORE / "index.json").write_text(json.dumps(index, indent=2) + "\n")

    # Offline fallback bundled with the plugin mirrors the online store.
    (DEFAULTS / "packs").mkdir(parents=True, exist_ok=True)
    for old in (DEFAULTS / "packs").glob("*.json"):
        old.unlink()
    for f in pack_files:
        shutil.copy2(f, DEFAULTS / "packs" / f.name)
    shutil.copy2(STORE / "index.json", DEFAULTS / "store-index.json")

    print(f"\nWrote store/index.json and defaults/ ({len(entries)} games).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
