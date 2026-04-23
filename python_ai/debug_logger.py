from __future__ import annotations

import json
import os
import threading
import time
from typing import Any


_LOG_LOCK = threading.Lock()
_LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")


def log_event(log_name: str, payload: dict[str, Any]) -> None:
    os.makedirs(_LOG_DIR, exist_ok=True)
    log_path = os.path.join(_LOG_DIR, f"{log_name}.jsonl")
    enriched_payload = {
        "timestamp": int(time.time() * 1000),
        **payload,
    }

    with _LOG_LOCK:
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(enriched_payload, ensure_ascii=False) + "\n")
