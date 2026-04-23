from __future__ import annotations

import json
import re
import time
from typing import Any

from .debug_logger import log_event


ALLOWED_LORE_TYPES = {
    "myth_fragment",
    "rumor",
    "historical_note",
    "relic_description",
    "location_legend",
    "character_rumor",
}

CANON_CONSTRAINTS = [
    "Kharlroth is the main hero.",
    "Yrsa is his wife and first guide.",
    "Fenrir spreads fear and despair across Midgard.",
    "Kharlroth must recover relics.",
    "Eirik is a farmer.",
    "Styrbjorn is a wise elder in North Midgard.",
    "The Eye of Odin is in Yggdrasil's roots guarded by Níðhöggr.",
]


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.I).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None


def infer_lore_type(topic: str | None, npc_id: str, user_message: str) -> str:
    lowered = (f"{topic or ''} {user_message}").lower()
    if "relic" in lowered or "eye of odin" in lowered:
        return "relic_description"
    if "where" in lowered or "place" in lowered or "north midgard" in lowered or "yggdrasil" in lowered:
        return "location_legend"
    if any(name in lowered for name in ("yrsa", "eirik", "styrbjorn")):
        return "character_rumor"
    if any(name in lowered for name in ("fenrir", "odin", "nidhoggr")):
        return "myth_fragment" if npc_id == "yrsa" else "rumor"
    return "rumor" if npc_id == "eirik" else "historical_note"


class LoreGenerator:
    def __init__(self, bridge: Any) -> None:
        self.bridge = bridge

    def _fallback_entry(
        self,
        *,
        topic: str,
        lore_type: str,
        npc_name: str,
        scene_id: str,
    ) -> dict[str, Any]:
        return {
            "id": f"lore_{re.sub(r'[^a-z0-9]+', '_', topic.lower()).strip('_')}_{int(time.time())}",
            "title": f"Whispers of {topic}",
            "type": lore_type,
            "topic": topic,
            "content": f"Folk speak of {topic} in low voices, as if saying too much might draw its gaze. What is certain is only this: Midgard is uneasy, and old truths do not lie quiet forever.",
            "source_npc": npc_name,
            "scene": scene_id,
            "tags": [topic.lower(), "midgard", lore_type],
        }

    def _validate_entry(
        self,
        payload: dict[str, Any] | None,
        *,
        topic: str,
        lore_type: str,
        npc_name: str,
        scene_id: str,
    ) -> dict[str, Any] | None:
        if not payload:
            return None

        entry = {
            "id": str(payload.get("id") or f"lore_{re.sub(r'[^a-z0-9]+', '_', topic.lower()).strip('_')}_{int(time.time())}"),
            "title": str(payload.get("title") or f"Whispers of {topic}"),
            "type": str(payload.get("type") or lore_type),
            "topic": topic,
            "content": str(payload.get("content") or "").strip(),
            "source_npc": str(payload.get("source_npc") or npc_name),
            "scene": str(payload.get("scene") or scene_id),
            "tags": payload.get("tags") or [topic.lower(), lore_type],
        }

        if entry["type"] not in ALLOWED_LORE_TYPES:
            entry["type"] = lore_type
        if not isinstance(entry["tags"], list):
            entry["tags"] = [topic.lower(), entry["type"]]
        entry["tags"] = [str(tag) for tag in entry["tags"][:8]]
        if not entry["content"]:
            return None
        if re.search(r"\b(ai|javascript|python|github|api|prompt)\b", entry["content"], re.I):
            return None
        return entry

    def generate(
        self,
        *,
        topic: str,
        user_message: str,
        npc_id: str,
        npc_name: str,
        scene_id: str,
    ) -> dict[str, Any]:
        lore_type = infer_lore_type(topic, npc_id, user_message)
        fallback = self._fallback_entry(
            topic=topic,
            lore_type=lore_type,
            npc_name=npc_name,
            scene_id=scene_id,
        )

        if not self.bridge.is_role_ready("responder_slow"):
            log_event("lore_generator", {
                "topic": topic,
                "npcId": npc_id,
                "sceneId": scene_id,
                "status": "fallback_model_not_ready",
            })
            return fallback

        prompt_variants = [
            "Return one valid JSON object only.",
            "STRICT MODE: output JSON only with no commentary and no markdown.",
        ]

        for attempt_index, extra_instruction in enumerate(prompt_variants):
            try:
                result = self.bridge.chat_completion(
                    "responder_slow",
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You generate lore entries for a Norse-inspired RPG. "
                                "Keep the tone grounded, local, and in-world. "
                                "Write 2 to 5 sentences. No modern language. "
                                "Do not contradict canon. "
                                f"Canon constraints: {' '.join(CANON_CONSTRAINTS)} "
                                "Return JSON with exactly these fields: id, title, type, topic, content, source_npc, scene, tags. "
                                f"Allowed lore types: {', '.join(sorted(ALLOWED_LORE_TYPES))}. "
                                f"{extra_instruction}"
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"/no_think Topic: {topic}. "
                                f"Requested by NPC: {npc_name} ({npc_id}). "
                                f"Scene: {scene_id}. "
                                f"Requested lore type: {lore_type}. "
                                f"Player question: {user_message}"
                            ),
                        },
                    ],
                    max_completion_tokens=220,
                    temperature=0.5,
                    timeout_seconds=90,
                )
                payload = _extract_json_object(result.get("raw_content", ""))
                validated = self._validate_entry(
                    payload,
                    topic=topic,
                    lore_type=lore_type,
                    npc_name=npc_name,
                    scene_id=scene_id,
                )
                if validated:
                    log_event("lore_generator", {
                        "topic": topic,
                        "npcId": npc_id,
                        "sceneId": scene_id,
                        "status": "generated",
                        "attempt": attempt_index + 1,
                        "entryId": validated["id"],
                    })
                    return validated
            except Exception as exc:
                log_event("lore_generator", {
                    "topic": topic,
                    "npcId": npc_id,
                    "sceneId": scene_id,
                    "status": "error",
                    "attempt": attempt_index + 1,
                    "error": str(exc),
                })

        log_event("lore_generator", {
            "topic": topic,
            "npcId": npc_id,
            "sceneId": scene_id,
            "status": "fallback_invalid_json",
            "entryId": fallback["id"],
        })
        return fallback
