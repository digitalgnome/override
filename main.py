import asyncio
import json
import os
import re
import time
from pathlib import Path

import sys

import aiohttp
import decky

# Decky adds py_modules to sys.path; this also covers running from elsewhere.
sys.path.insert(0, str(Path(__file__).parent / "py_modules"))
import cheatmem  # noqa: E402

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Built from store/packs/ by tools/build_store.py; edit there, then push.
_STORE_INDEX_URL = (
    "https://raw.githubusercontent.com/digitalgnome/override/main/store/index.json"
)
_STORE_INDEX_CACHE_TTL = 300  # seconds

_store_index_cache: dict | None = None
_store_index_cache_time: float = 0.0

# Pack ids end up in file names, and the backend runs as root, so only allow
# a conservative character set (no slashes, no leading dot).
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$")


def _settings_dir() -> Path:
    return Path(decky.DECKY_PLUGIN_SETTINGS_DIR)


def _plugin_dir() -> Path:
    return Path(decky.DECKY_PLUGIN_DIR)


def _check_id(pack_id: str) -> str:
    if not isinstance(pack_id, str) or not _SAFE_ID.match(pack_id):
        raise ValueError(f"Invalid pack id: {pack_id!r}")
    return pack_id


def _pack_path(pack_id: str) -> Path:
    return _settings_dir() / "packs" / f"{_check_id(pack_id)}.json"


def _state_path(pack_id: str) -> Path:
    return _settings_dir() / "states" / f"{_check_id(pack_id)}.json"


def _bundled_pack_path(pack_id: str) -> Path:
    return _plugin_dir() / "defaults" / "packs" / f"{_check_id(pack_id)}.json"


def _migrate_from_old_name() -> None:
    """
    The plugin used to be called "cheat-code", and Decky names the settings
    folder after the plugin folder. Copy installed packs, cheat states and
    the art cache over once so nothing is lost after the rename.
    """
    import shutil

    old = _settings_dir().parent / "cheat-code"
    new = _settings_dir()
    if not old.is_dir() or (new / ".migrated").exists():
        return
    try:
        for sub in ("packs", "states"):
            (new / sub).mkdir(parents=True, exist_ok=True)
            for f in (old / sub).glob("*.json"):
                if not (new / sub / f.name).exists():
                    shutil.copy2(f, new / sub / f.name)
        if (old / "art.json").exists() and not (new / "art.json").exists():
            shutil.copy2(old / "art.json", new / "art.json")
        (new / ".migrated").write_text("from cheat-code\n")
        decky.logger.info(f"Migrated settings from {old}")
    except Exception as exc:
        decky.logger.warning(f"Settings migration from {old} failed: {exc}")


def _read_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def _ssl_context():
    """Decky's bundled Python sometimes lacks a CA store; prefer certifi."""
    try:
        import ssl

        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


async def _fetch_json(url: str, timeout: int):
    async with aiohttp.ClientSession() as session:
        async with session.get(
            url, timeout=aiohttp.ClientTimeout(total=timeout), ssl=_ssl_context()
        ) as resp:
            resp.raise_for_status()
            return await resp.json(content_type=None)


def _validate_pack(data) -> None:
    if not isinstance(data, dict) or not isinstance(data.get("cheats"), list):
        raise ValueError("Pack is missing a 'cheats' list")
    for cheat in data["cheats"]:
        if not isinstance(cheat, dict) or "id" not in cheat or "type" not in cheat:
            raise ValueError("Every cheat needs an 'id' and a 'type'")
        if cheat["type"] not in ("toggle", "value"):
            raise ValueError(f"Unknown cheat type {cheat['type']!r}")


def _default_states(pack: dict) -> list:
    return [
        {
            "cheatId": cheat["id"],
            "enabled": False,
            "value": cheat.get("defaultValue"),
        }
        for cheat in pack.get("cheats", [])
    ]


def _coerce_value(value, value_type: str | None):
    if value in (None, ""):
        return None
    try:
        if value_type == "integer":
            return int(float(value))
        if value_type == "float":
            return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{value}' is not a valid {value_type}")
    return str(value)


class Plugin:
    # -----------------------------------------------------------------------
    # Lifecycle hooks
    # -----------------------------------------------------------------------

    async def _main(self):
        decky.logger.info("Override: plugin loaded")
        _migrate_from_old_name()
        os.makedirs(_settings_dir() / "packs", exist_ok=True)
        os.makedirs(_settings_dir() / "states", exist_ok=True)

    async def _unload(self):
        decky.logger.info("Override: plugin unloaded")

    async def _migration(self):
        pass

    # -----------------------------------------------------------------------
    # Running game
    # -----------------------------------------------------------------------

    async def get_running_game(self) -> dict | None:
        """Return {"appId", "name"} for the running Steam game, or None."""
        try:
            app_id = await asyncio.get_running_loop().run_in_executor(
                None, _find_steam_app_id
            )
            if app_id is None:
                return None
            name = await asyncio.get_running_loop().run_in_executor(
                None, _resolve_game_name, app_id
            )
            return {"appId": app_id, "name": name}
        except Exception as exc:
            decky.logger.error(f"get_running_game error: {exc}")
            return None

    # -----------------------------------------------------------------------
    # Installed packs
    # -----------------------------------------------------------------------

    async def get_downloaded_packs(self) -> list:
        """Every installed CheatPack, sorted by game name."""
        result = []
        for json_file in (_settings_dir() / "packs").glob("*.json"):
            try:
                result.append(_read_json(json_file))
            except Exception as exc:
                decky.logger.warning(f"Failed to read pack {json_file}: {exc}")
        result.sort(key=lambda p: str(p.get("gameName", "")).lower())
        return result

    async def get_cheat_states(self, pack_id: str) -> list:
        """Saved states for a pack, filled in with defaults for new cheats."""
        try:
            pack = _read_json(_pack_path(pack_id))
        except Exception as exc:
            decky.logger.warning(f"get_cheat_states: no pack {pack_id}: {exc}")
            return []

        defaults = _default_states(pack)
        try:
            saved = {s["cheatId"]: s for s in _read_json(_state_path(pack_id))}
        except FileNotFoundError:
            saved = {}
        except Exception as exc:
            decky.logger.warning(f"Bad state file for {pack_id}: {exc}")
            saved = {}

        # Drop states for cheats that no longer exist; add new ones as defaults.
        return [saved.get(d["cheatId"], d) for d in defaults]

    async def set_cheat_state(
        self, pack_id: str, cheat_id: str, enabled: bool, value
    ) -> dict:
        """
        Save one cheat's state and try to apply it to the running game.

        Returns {"success", "applied", "message"?, "error"?}. "applied" is
        False when the state was saved but nothing was written to memory
        (no game running, no addresses defined, permission denied, ...).
        """
        try:
            pack = _read_json(_pack_path(pack_id))
            cheat = next((c for c in pack["cheats"] if c["id"] == cheat_id), None)
            if cheat is None:
                return {"success": False, "error": f"Unknown cheat {cheat_id}"}

            coerced = (
                _coerce_value(value, cheat.get("valueType"))
                if cheat["type"] == "value"
                else None
            )
            if cheat["type"] == "value" and enabled and coerced is None:
                return {"success": False, "error": "Enter a value first"}
            if isinstance(coerced, (int, float)):
                lo, hi = cheat.get("min"), cheat.get("max")
                if (lo is not None and coerced < lo) or (hi is not None and coerced > hi):
                    return {"success": False, "error": f"Value must be between {lo} and {hi}"}

            states = await self.get_cheat_states(pack_id)
            for s in states:
                if s["cheatId"] == cheat_id:
                    s["enabled"] = bool(enabled)
                    if coerced is not None:
                        s["value"] = coerced
            _write_json(_state_path(pack_id), states)

            applied, message = await self._apply_cheat_to_process(
                cheat, bool(enabled), coerced, pack.get("steamAppId")
            )
            return {"success": True, "applied": applied, "message": message}
        except Exception as exc:
            decky.logger.error(f"set_cheat_state error: {exc}")
            return {"success": False, "error": str(exc)}

    async def delete_pack(self, pack_id: str) -> dict:
        """Remove an installed pack and its saved states."""
        try:
            _pack_path(pack_id).unlink(missing_ok=True)
            _state_path(pack_id).unlink(missing_ok=True)
            decky.logger.info(f"Deleted pack {pack_id}")
            return {"success": True}
        except Exception as exc:
            decky.logger.error(f"delete_pack error: {exc}")
            return {"success": False, "error": str(exc)}

    # -----------------------------------------------------------------------
    # Store
    # -----------------------------------------------------------------------

    async def get_store_index(self, force_refresh: bool = False) -> dict:
        """
        The store index from GitHub (cached for 5 minutes). Falls back to
        the bundled defaults/store-index.json when offline.
        """
        global _store_index_cache, _store_index_cache_time

        now = time.monotonic()
        if (
            not force_refresh
            and _store_index_cache is not None
            and now - _store_index_cache_time < _STORE_INDEX_CACHE_TTL
        ):
            return _store_index_cache

        data = None
        try:
            data = await _fetch_json(_STORE_INDEX_URL, timeout=10)
            data["source"] = "online"
        except Exception as exc:
            decky.logger.warning(f"Store index fetch failed ({exc}); using bundled")
            try:
                data = _read_json(_plugin_dir() / "defaults" / "store-index.json")
                data["source"] = "bundled"
            except Exception as exc2:
                decky.logger.error(f"Failed to read bundled store index: {exc2}")
                return {"entries": [], "lastUpdated": "", "source": "none"}

        # Drop entries whose id can't be used safely as a file name.
        data["entries"] = [
            e for e in data.get("entries", []) if _SAFE_ID.match(str(e.get("id", "")))
        ]
        _store_index_cache = data
        _store_index_cache_time = now
        return data

    async def get_app_art(self, app_id: str) -> dict:
        """
        Banner + capsule image URLs for a Steam app. Newer games keep their
        images under hashed store paths, so ask the Steam store API once and
        cache the answer in settings/art.json. Falls back to the classic CDN
        paths (which work for older games) when offline.
        """
        app_id = str(app_id)
        fallback = {
            "header": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg",
            "capsule": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/capsule_184x69.jpg",
        }
        if not app_id.isdigit():
            return fallback

        cache_file = _settings_dir() / "art.json"
        try:
            cache = _read_json(cache_file)
        except Exception:
            cache = {}
        if app_id in cache:
            return cache[app_id]

        try:
            url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&filters=basic"
            data = (await _fetch_json(url, timeout=10)).get(app_id, {})
            info = data.get("data", {}) if data.get("success") else {}
            art = {
                "header": info.get("header_image") or fallback["header"],
                "capsule": info.get("capsule_image") or info.get("header_image") or fallback["capsule"],
            }
        except Exception as exc:
            decky.logger.warning(f"get_app_art({app_id}) failed: {exc}")
            return fallback  # don't cache failures; retry next time

        cache[app_id] = art
        try:
            _write_json(cache_file, cache)
        except Exception as exc:
            decky.logger.warning(f"Could not save art cache: {exc}")
        return art

    async def search_store(self, query: str) -> list:
        """Case-insensitive match on game name, description or Steam app id."""
        index = await self.get_store_index()
        q = query.strip().lower()
        if not q:
            return index.get("entries", [])
        return [
            e
            for e in index.get("entries", [])
            if q in e.get("gameName", "").lower()
            or q in e.get("description", "").lower()
            or q == str(e.get("steamAppId", ""))
        ]

    async def download_pack(self, store_entry_id: str, download_url: str) -> dict:
        """
        Download a pack and install it. If the download fails and the plugin
        ships a bundled copy in defaults/packs/, install that instead.
        """
        try:
            dest = _pack_path(store_entry_id)
        except ValueError as exc:
            return {"success": False, "error": str(exc)}

        data = None
        source = "online"
        try:
            data = await _fetch_json(download_url, timeout=30)
            _validate_pack(data)
        except Exception as exc:
            decky.logger.warning(f"Download of {store_entry_id} failed: {exc}")
            bundled = _bundled_pack_path(store_entry_id)
            if not bundled.exists():
                return {"success": False, "error": f"Download failed: {exc}"}
            try:
                data = _read_json(bundled)
                _validate_pack(data)
                source = "bundled"
            except Exception as exc2:
                return {"success": False, "error": f"Bundled pack invalid: {exc2}"}

        # The store id is what the UI tracks, so make the pack agree with it.
        data["id"] = store_entry_id
        _write_json(dest, data)
        decky.logger.info(f"Installed pack {store_entry_id} ({source}) -> {dest}")
        return {"success": True, "source": source}

    # -----------------------------------------------------------------------
    # Memory
    # -----------------------------------------------------------------------

    async def read_cheat_values(self, pack_id: str) -> dict:
        """
        Current in-game values of a pack's value cheats, e.g. {"set-gil": 41699}.
        Empty when the game isn't running or nothing could be located.
        """
        try:
            pack = _read_json(_pack_path(pack_id))
            loop = asyncio.get_running_loop()
            pid = await loop.run_in_executor(None, cheatmem.find_game_pid, pack.get("steamAppId"))
            if pid is None:
                return {}
            result = {}
            for cheat in pack.get("cheats", []):
                if cheat.get("type") == "value" and cheat.get("addresses"):
                    v = await loop.run_in_executor(None, cheatmem.read_value, pid, cheat)
                    if v is not None and not isinstance(v, bytes):
                        result[cheat["id"]] = v
            return result
        except Exception as exc:
            decky.logger.warning(f"read_cheat_values({pack_id}) failed: {exc}")
            return {}

    async def _apply_cheat_to_process(
        self, cheat: dict, enabled: bool, value, app_id: str | None
    ) -> tuple[bool, str]:
        """Best-effort write of the cheat into the running game's memory."""
        if not cheat.get("addresses"):
            return False, "Saved (this cheat has no memory addresses yet)"
        loop = asyncio.get_running_loop()
        pid = await loop.run_in_executor(None, cheatmem.find_game_pid, app_id)
        if pid is None:
            return False, "Saved (game not running)"
        try:
            applied, message = await loop.run_in_executor(
                None, cheatmem.apply, pid, cheat, enabled, value
            )
        except PermissionError:
            return False, "Saved, but permission denied writing game memory"
        except FileNotFoundError:
            return False, "Saved (game process exited)"
        decky.logger.info(f"Cheat {cheat['id']} on PID {pid}: {message}")
        return applied, message


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _find_steam_app_id() -> str | None:
    return next((app_id for _, app_id in cheatmem.iter_steam_app_ids()), None)


def _resolve_game_name(app_id: str) -> str:
    """Best-effort: read the game's name from its appmanifest file."""
    home = Path(getattr(decky, "DECKY_USER_HOME", str(Path.home())))
    roots = [home / ".local/share/Steam", home / ".steam/steam"]
    # Also look in extra library folders (SD card etc.)
    for root in list(roots):
        try:
            text = (root / "steamapps/libraryfolders.vdf").read_text(errors="replace")
            roots += [Path(p) for p in re.findall(r'"path"\s+"([^"]+)"', text)]
        except Exception:
            pass
    for root in roots:
        manifest = root / "steamapps" / f"appmanifest_{app_id}.acf"
        try:
            match = re.search(r'"name"\s+"([^"]+)"', manifest.read_text(errors="replace"))
            if match:
                return match.group(1)
        except Exception:
            continue
    return f"App {app_id}"
