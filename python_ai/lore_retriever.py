from __future__ import annotations

import re
from typing import Any


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9íðþæøå]+", (text or "").lower()))


class LoreRetriever:
    def __init__(self, store: Any) -> None:
        self.store = store

    def find_best_match(
        self,
        *,
        topic: str | None,
        user_message: str,
        scene_id: str | None = None,
        npc_name: str | None = None,
    ) -> dict[str, Any] | None:
        entries = self.store.all_entries()
        if not entries:
            return None

        message_tokens = _tokenize(user_message)
        topic_tokens = _tokenize(topic or "")
        best_entry = None
        best_score = 0

        for entry in entries:
            score = 0
            entry_topic = (entry.get("topic") or "").lower()
            entry_tags = {str(tag).lower() for tag in entry.get("tags", [])}
            entry_tokens = _tokenize(" ".join([
                entry.get("title", ""),
                entry.get("topic", ""),
                entry.get("content", ""),
                " ".join(entry.get("tags", [])),
            ]))

            if topic and entry_topic == topic.lower():
                score += 8
            if topic_tokens & entry_tokens:
                score += len(topic_tokens & entry_tokens) * 3
            if message_tokens & entry_tokens:
                score += len(message_tokens & entry_tokens) * 2
            if scene_id and str(entry.get("scene", "")).lower() == scene_id.lower():
                score += 1
            if npc_name and str(entry.get("source_npc", "")).lower() == npc_name.lower():
                score += 1
            if topic and topic.lower() in entry_tags:
                score += 3

            if score > best_score:
                best_score = score
                best_entry = entry

        return best_entry if best_score >= 4 else None
