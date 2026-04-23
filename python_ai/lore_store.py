from __future__ import annotations

import json
import os
import threading
from typing import Any


class LoreStore:
    def __init__(self, store_path: str | None = None) -> None:
        base_dir = os.path.dirname(__file__)
        self.store_path = store_path or os.path.join(base_dir, "data", "lore_store.json")
        self._lock = threading.Lock()
        self._ensure_store()

    def _ensure_store(self) -> None:
        os.makedirs(os.path.dirname(self.store_path), exist_ok=True)
        if not os.path.exists(self.store_path):
            with open(self.store_path, "w", encoding="utf-8") as handle:
                json.dump({"entries": []}, handle, ensure_ascii=False, indent=2)

    def _read(self) -> dict[str, Any]:
        self._ensure_store()
        with open(self.store_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            data = {"entries": []}
        if not isinstance(data.get("entries"), list):
            data["entries"] = []
        return data

    def all_entries(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._read()["entries"])

    def save_entry(self, entry: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read()
            entries = data["entries"]
            existing_index = next((index for index, item in enumerate(entries) if item.get("id") == entry.get("id")), None)
            if existing_index is None:
                entries.append(entry)
            else:
                entries[existing_index] = entry

            with open(self.store_path, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)

        return entry
