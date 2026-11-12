#!/usr/bin/env python3
"""
Build the frontend and package the plugin as out/override.zip, laid out the
way Decky Loader expects (one top-level "override/" folder).

    python3 tools/package.py

Upload out/override.zip to a GitHub Release, then on the Deck use
Decky → Settings → Developer → Install Plugin from URL with:
    https://github.com/digitalgnome/override/releases/latest/download/override.zip
"""
import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
NAME = "override"

FILES = ["plugin.json", "package.json", "main.py", "README.md", "dist/index.js"]
DIRS = ["py_modules", "defaults"]


def main() -> int:
    plugin = json.loads((ROOT / "plugin.json").read_text())
    package = json.loads((ROOT / "package.json").read_text())
    if plugin.get("version") != package.get("version"):
        print(f"Version mismatch: plugin.json {plugin.get('version')} vs package.json {package.get('version')}")
        return 1

    print("==> Building frontend")
    subprocess.run([str(ROOT / "node_modules/.bin/rollup"), "-c", "rollup.config.js"], cwd=ROOT, check=True)

    print("==> Rebuilding store / bundled defaults")
    subprocess.run([sys.executable, str(ROOT / "tools/build_store.py")], cwd=ROOT, check=True)

    OUT.mkdir(exist_ok=True)
    zip_path = OUT / f"{NAME}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in FILES:
            z.write(ROOT / rel, f"{NAME}/{rel}")
        for d in DIRS:
            for f in sorted((ROOT / d).rglob("*")):
                if f.is_file() and "__pycache__" not in f.parts and f.suffix != ".pyc":
                    z.write(f, f"{NAME}/{f.relative_to(ROOT)}")

    print(f"\n==> {zip_path}  (v{plugin['version']})")
    with zipfile.ZipFile(zip_path) as z:
        for n in z.namelist():
            print("   ", n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
