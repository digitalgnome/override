"""
Game-memory helpers for Override. No Decky dependency, so this file can
also be run directly on the Deck to test a pack:

    sudo python3 py_modules/cheatmem.py defaults/packs/<pack>.json <cheat-id> [value]

Address entries in a cheat pack can be:

  Fixed address (only useful if it never moves):
    {"offset": "0x39fd8128", "size": 4}

  Pointer chains, in PINCE / Cheat Engine notation:
    {"size": 4, "pointers": [
        "FFRS-Win64-Shipping.exe+0x9A6F220 -> 0x7b8 -> 0x60 -> 0x28",
        ...
    ]}

  "module+0xBASE" is read as a pointer, every following offset except the
  last is added and dereferenced, and the last offset is added to give the
  final address. All chains are resolved; the address most of them agree
  on (and whose current value passes validation) wins.

Plus, for toggles: "enabledValue"/"disabledValue" byte lists.
"""
from __future__ import annotations

import os
import re
import struct
from collections import Counter
from pathlib import Path

PTR_SIZE = 8


# ---------------------------------------------------------------------------
# Finding the game process
# ---------------------------------------------------------------------------

def iter_steam_app_ids():
    """Yield (pid, app_id) for processes with a non-zero SteamAppId."""
    for pid_dir in Path("/proc").iterdir():
        if not pid_dir.name.isdigit():
            continue
        try:
            raw = (pid_dir / "environ").read_bytes()
        except Exception:
            continue
        for item in raw.split(b"\x00"):
            if item.startswith(b"SteamAppId="):
                app_id = item[len(b"SteamAppId="):].decode("utf-8", "replace").strip()
                if app_id.isdigit() and app_id != "0":
                    yield int(pid_dir.name), app_id
                break


def rss_kb(pid: int) -> int:
    try:
        for line in Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    except Exception:
        pass
    return 0


def find_game_pid(app_id: str | None = None) -> int | None:
    """
    Steam/Proton start many helper processes that all carry SteamAppId
    (reaper, steam.exe, wineserver, explorer.exe, ...). The real game is the
    one using by far the most memory, e.g. FFRS-Win64-Shipping.exe, which
    shows up as "GameThread" under Proton.
    """
    pids = [p for p, a in iter_steam_app_ids() if app_id is None or a == app_id]
    return max(pids, key=rss_kb, default=None)


def module_base(pid: int, module: str) -> int | None:
    """Lowest mapped address of a file whose name matches `module`."""
    want = module.lower()
    base = None
    with open(f"/proc/{pid}/maps") as f:
        for line in f:
            parts = line.split(None, 5)
            if len(parts) < 6:
                continue
            path = parts[5].strip()
            if os.path.basename(path).lower() != want:
                continue
            start = int(parts[0].split("-")[0], 16)
            if base is None or start < base:
                base = start
    return base


# ---------------------------------------------------------------------------
# Pointer chains
# ---------------------------------------------------------------------------

_CHAIN_RE = re.compile(r"^\s*(?P<module>[^+]+)\+(?P<base>0x[0-9a-fA-F]+)(?P<rest>(\s*->\s*-?0x[0-9a-fA-F]+)*)\s*$")


def parse_chain(text: str) -> tuple[str, int, list[int]]:
    m = _CHAIN_RE.match(text)
    if not m:
        raise ValueError(f"Bad pointer chain: {text!r}")
    offsets = [int(x.strip(), 16) for x in m.group("rest").split("->")[1:]]
    return m.group("module").strip(), int(m.group("base"), 16), offsets


class Memory:
    """Thin wrapper over /proc/<pid>/mem."""

    def __init__(self, pid: int, writable: bool = False):
        self.pid = pid
        self.fd = os.open(f"/proc/{pid}/mem", os.O_RDWR if writable else os.O_RDONLY)
        self._bases: dict[str, int | None] = {}

    def close(self):
        os.close(self.fd)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def read(self, addr: int, size: int) -> bytes | None:
        try:
            data = os.pread(self.fd, size, addr)
            return data if len(data) == size else None
        except OSError:
            return None

    def write(self, addr: int, data: bytes) -> None:
        if os.pwrite(self.fd, data, addr) != len(data):
            raise OSError("short write")

    def read_ptr(self, addr: int) -> int | None:
        raw = self.read(addr, PTR_SIZE)
        if raw is None:
            return None
        ptr = int.from_bytes(raw, "little")
        # User-space pointers on x86-64 are below 0x0000_8000_0000_0000.
        return ptr if 0x10000 <= ptr < 0x800000000000 else None

    def base_of(self, module: str) -> int | None:
        if module not in self._bases:
            self._bases[module] = module_base(self.pid, module)
        return self._bases[module]

    def resolve_chain(self, text: str) -> int | None:
        module, base_off, offsets = parse_chain(text)
        base = self.base_of(module)
        if base is None:
            return None
        addr = self.read_ptr(base + base_off)
        if addr is None:
            return None
        if not offsets:
            return addr
        for off in offsets[:-1]:
            addr = self.read_ptr(addr + off)
            if addr is None:
                return None
        return addr + offsets[-1]


# ---------------------------------------------------------------------------
# Cheat values
# ---------------------------------------------------------------------------

def decode(cheat: dict, raw: bytes):
    vt = cheat.get("valueType")
    if vt == "float":
        return struct.unpack("<d" if len(raw) == 8 else "<f", raw)[0]
    if vt == "integer":
        return int.from_bytes(raw, "little", signed=True)
    return raw


def encode(cheat: dict, entry: dict, enabled: bool, value) -> bytes | None:
    size = int(entry.get("size", 4))
    raw = entry.get("enabledValue" if enabled else "disabledValue")
    if raw is not None:
        return bytes(raw[:size])
    if not enabled or cheat.get("type") != "value" or value is None:
        return None
    vt = cheat.get("valueType")
    if vt == "float":
        return struct.pack("<d" if size == 8 else "<f", float(value))
    if vt == "integer":
        return int(value).to_bytes(size, "little", signed=True)
    return str(value).encode("utf-8")[:size].ljust(size, b"\x00")


def _plausible(cheat: dict, entry: dict, raw: bytes | None) -> bool:
    """Sanity-check the current value before trusting an address."""
    if raw is None:
        return False
    if cheat.get("type") != "value" or cheat.get("valueType") not in ("integer", "float"):
        return True
    v = decode(cheat, raw)
    lo = entry.get("validMin", cheat.get("min"))
    hi = entry.get("validMax", cheat.get("max"))
    if isinstance(v, float) and v != v:  # NaN
        return False
    return (lo is None or v >= lo) and (hi is None or v <= hi)


def locate(mem: Memory, cheat: dict, entry: dict) -> tuple[int | None, str]:
    """Return (address, explanation) for one address entry."""
    size = int(entry.get("size", 4))
    if "offset" in entry:
        addr = int(str(entry["offset"]), 16)
        ok = _plausible(cheat, entry, mem.read(addr, size))
        return (addr, "fixed address") if ok else (None, "fixed address has an implausible value")

    chains = entry.get("pointers") or []
    votes: Counter[int] = Counter()
    for chain in chains:
        try:
            addr = mem.resolve_chain(chain)
        except ValueError:
            continue
        if addr is not None and _plausible(cheat, entry, mem.read(addr, size)):
            votes[addr] += 1
    if not votes:
        return None, f"none of {len(chains)} pointer chains resolved"
    addr, n = votes.most_common(1)[0]
    return addr, f"{n}/{len(chains)} pointer chains agree"


def apply(pid: int, cheat: dict, enabled: bool, value) -> tuple[bool, str]:
    """Write a cheat into the game. Returns (applied, message)."""
    entries = cheat.get("addresses") or []
    if not entries:
        return False, "Saved (this cheat has no memory addresses yet)"
    written, notes = 0, []
    with Memory(pid, writable=True) as mem:
        for entry in entries:
            payload = encode(cheat, entry, enabled, value)
            if payload is None:
                continue
            addr, why = locate(mem, cheat, entry)
            if addr is None:
                notes.append(why)
                continue
            mem.write(addr, payload)
            written += 1
    if written:
        return True, "Applied"
    return False, "Saved, but not applied: " + ("; ".join(notes) or "nothing to write")


def read_value(pid: int, cheat: dict):
    """Current in-game value of a value cheat, or None."""
    for entry in cheat.get("addresses") or []:
        with Memory(pid) as mem:
            addr, _ = locate(mem, cheat, entry)
            if addr is not None:
                raw = mem.read(addr, int(entry.get("size", 4)))
                if raw is not None:
                    return decode(cheat, raw)
    return None


# ---------------------------------------------------------------------------
# CLI for testing on the Deck
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    pack = json.load(open(sys.argv[1]))
    cheat = next(c for c in pack["cheats"] if c["id"] == sys.argv[2])
    pid = find_game_pid(pack.get("steamAppId"))
    if pid is None:
        sys.exit(f"{pack['gameName']} (app {pack.get('steamAppId')}) is not running")
    print(f"Game PID {pid} ({rss_kb(pid) // 1024} MB)")

    with Memory(pid) as mem:
        for entry in cheat.get("addresses") or []:
            size = int(entry.get("size", 4))
            for chain in entry.get("pointers") or []:
                addr = mem.resolve_chain(chain)
                raw = mem.read(addr, size) if addr else None
                shown = decode(cheat, raw) if raw else "-"
                print(f"  {'0x%x' % addr if addr else 'unresolved':>16}  {shown!s:>12}  {chain}")
            addr, why = locate(mem, cheat, entry)
            print(f"=> {('0x%x' % addr) if addr else 'NOT FOUND'} ({why})")
            if addr:
                print(f"   current value: {decode(cheat, mem.read(addr, size))}")

    if len(sys.argv) > 3:
        ok, msg = apply(pid, cheat, True, sys.argv[3])
        print(f"write {sys.argv[3]}: {msg}")
