from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from typing import Any

from .debug_logger import log_event


SUPPORTED_INTENTS = {
    "ask_world_info",
    "ask_character_info",
    "ask_quest_guidance",
    "ask_direction",
    "ask_lore",
    "small_talk",
    "goodbye",
    "unknown",
}

PERSON_KEYWORDS = {
    "yrsa": "Yrsa",
    "eirik": "Eirik",
    "styrbjorn": "Styrbjorn",
    "kharlroth": "Kharlroth",
    "odin": "Odin",
    "fenrir": "Fenrir",
    "nidhoggr": "Níðhöggr",
}

PLACE_KEYWORDS = {
    "midgard": "Midgard",
    "north midgard": "North Midgard",
    "nidavellir": "Nidavellir",
    "yggdrasil": "Yggdrasil",
    "house": "KharlrothHouse",
    "home": "KharlrothHouse",
}

TOPIC_KEYWORDS = {
    "fenrir": "Fenrir",
    "rune of whispers": "Rune of Whispers",
    "whispers": "Rune of Whispers",
    "rune": "Rune of Whispers",
    "relic": "Relics",
    "relics": "Relics",
    "styrbjorn": "Styrbjorn",
    "yrsa": "Yrsa",
    "eirik": "Eirik",
    "midgard": "Midgard",
    "north midgard": "North Midgard",
    "yggdrasil": "Yggdrasil",
    "odin": "Odin",
    "eye of odin": "Eye of Odin",
    "nidhoggr": "Níðhöggr",
    "nidavellir": "Nidavellir",
    "jotunheim": "Jotunheim",
    "realms": "Realms",
    "realm": "Realms",
    "dwarves": "Nidavellir",
    "dwarf": "Nidavellir",
    "fear": "Fear",
    "shadow": "Fenrir",
}


@dataclass
class IntentClassification:
    intent: str
    confidence: float
    entities: dict[str, str | None]
    source: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None

    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.I).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()

    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        return None

    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _normalize_entities(payload: dict[str, Any], user_message: str) -> dict[str, str | None]:
    raw_entities = payload.get("entities") or {}
    entities = {
        "topic": raw_entities.get("topic"),
        "target_person": raw_entities.get("target_person"),
        "target_place": raw_entities.get("target_place"),
    }

    if not entities["topic"]:
        entities["topic"] = infer_topic(user_message)
    if not entities["target_person"]:
        entities["target_person"] = infer_person(user_message)
    if not entities["target_place"]:
        entities["target_place"] = infer_place(user_message)
    return entities


def validate_intent_payload(payload: dict[str, Any] | None, user_message: str) -> IntentClassification | None:
    if not payload or not isinstance(payload, dict):
        return None

    intent = str(payload.get("intent", "")).strip()
    if intent not in SUPPORTED_INTENTS:
        return None

    try:
        confidence = float(payload.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0

    confidence = max(0.0, min(1.0, confidence))
    entities = _normalize_entities(payload, user_message)
    return IntentClassification(
        intent=intent,
        confidence=confidence,
        entities=entities,
        source="model",
    )


def infer_person(user_message: str) -> str | None:
    lowered = user_message.lower()
    for keyword, person in PERSON_KEYWORDS.items():
        if keyword in lowered:
            return person
    if re.search(r"\bwho are you\b|\byour name\b", lowered):
        return None
    return None


def infer_place(user_message: str) -> str | None:
    lowered = user_message.lower()
    for keyword, place in PLACE_KEYWORDS.items():
        if keyword in lowered:
            return place
    return None


def infer_topic(user_message: str) -> str | None:
    lowered = user_message.lower()
    for keyword, topic in TOPIC_KEYWORDS.items():
        if keyword in lowered:
            return topic
    if re.search(r"\bwise man\b|\bwise elder\b", lowered):
        return "Styrbjorn"
    return None


def apply_intent_overrides(classification: IntentClassification, user_message: str) -> IntentClassification:
    lowered = user_message.lower().strip()

    if re.search(r"\b(bye|farewell|goodbye|good\s*bye|good\s+by|good-by|see you|leave you)\b", lowered):
        classification.intent = "goodbye"
        classification.confidence = max(classification.confidence, 0.98)
        return classification

    if re.search(r"\bwho are you\b|\byour name\b", lowered):
        classification.intent = "ask_character_info"
        classification.confidence = max(classification.confidence, 0.98)
        return classification

    if re.search(r"\bwhat is happening\b|\bwhat is wrong\b|\bwhere are we\b|\bwhere am i\b|\bthis place\b", lowered):
        classification.intent = "ask_world_info"
        classification.confidence = max(classification.confidence, 0.96)
        return classification

    if re.search(r"\bwhat should i do\b|\bwhat now\b|\bnext\b", lowered):
        classification.intent = "ask_quest_guidance"
        classification.confidence = max(classification.confidence, 0.97)
        return classification

    if re.search(r"\bwhere should i go\b|\bwhere do i go\b|\bwhere is\b|\bwhich way\b|\bdo you know a wise man\b|\bwise elder\b|\bstyrbjorn\b", lowered):
        classification.intent = "ask_direction"
        classification.confidence = max(classification.confidence, 0.97)
        return classification

    if re.search(r"\bwhat do you know about\b|\btell me about\b|\bwhat is fenrir\b|\bwhat are relics\b|\brelics\b|\bfenrir\b|\byggdrasil\b|\beye of odin\b|\bnidhoggr\b|\bnidavellir\b|\brune of whispers\b|\bfirst relic\b|\brealms\b|\bjotunheim\b|\bdwarves\b", lowered):
        classification.intent = "ask_lore"
        classification.confidence = max(classification.confidence, 0.96)
        return classification

    return classification


def fallback_classify_intent(user_message: str) -> IntentClassification:
    lowered = user_message.lower().strip()

    if re.search(r"\b(bye|farewell|goodbye|good\s*bye|good\s+by|good-by|see you|leave you)\b", lowered):
        intent = "goodbye"
    elif re.search(r"\bwise man\b|\bwise elder\b|\bstyrbjorn\b", lowered) and re.search(r"\b(do you know|where|find|go|looking for|seek)\b", lowered):
        intent = "ask_direction"
    elif re.search(r"\bwho are you\b|\byour name\b|\bwho is\b", lowered):
        intent = "ask_character_info"
    elif re.search(r"\bwhere\b|\bwhich way\b|\bhow do i get\b|\bdirection\b", lowered):
        intent = "ask_direction"
    elif re.search(r"\bwhat should i do\b|\bwhat now\b|\bnext\b|\bhelp\b|\bguide\b", lowered):
        intent = "ask_quest_guidance"
    elif re.search(r"\bwhat is\b|\btell me about\b|\blegend\b|\bmyth\b|\brumor\b|\brelic\b|\bfenrir\b|\byggdrasil\b|\bodin\b|\bnidavellir\b|\brune of whispers\b|\brealm\b|\bjotunheim\b|\bdwarf\b", lowered):
        intent = "ask_lore"
    elif re.search(r"\bwhere are we\b|\bwhat is happening\b|\bwhat is wrong\b|\bwho lives\b|\bwhat's this place\b", lowered):
        intent = "ask_world_info"
    elif re.search(r"\bhow are you\b|\bweather\b|\bcrops\b|\bday\b|\bhello\b|\bhi\b", lowered):
        intent = "small_talk"
    else:
        intent = "unknown"

    return IntentClassification(
        intent=intent,
        confidence=0.45,
        entities={
            "topic": infer_topic(user_message),
            "target_person": infer_person(user_message),
            "target_place": infer_place(user_message),
        },
        source="fallback",
    )


class IntentClassifier:
    def __init__(self, bridge: Any) -> None:
        self.bridge = bridge

    def classify(
        self,
        *,
        user_message: str,
        npc_id: str,
        npc_name: str,
        scene_id: str,
        nearby_objects: list[str],
    ) -> IntentClassification:
        fallback = fallback_classify_intent(user_message)

        if not self.bridge.is_role_ready("router"):
            log_event("intent_classifier", {
                "npcId": npc_id,
                "sceneId": scene_id,
                "userMessage": user_message,
                "result": fallback.to_dict(),
                "reason": "router_model_not_ready",
            })
            return fallback

        prompt_variants = [
            "Reply with JSON only. No prose, no markdown, no explanation.",
            "STRICT MODE: return one valid JSON object only. Do not wrap it in code fences.",
        ]

        for attempt_index, extra_instruction in enumerate(prompt_variants):
            try:
                result = self.bridge.chat_completion(
                    "router",
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You classify player intent for a local RPG NPC system. "
                                "Choose one intent from: ask_world_info, ask_character_info, ask_quest_guidance, "
                                "ask_direction, ask_lore, small_talk, goodbye, unknown. "
                                "Return JSON with exactly these keys: intent, confidence, entities. "
                                "The entities object must have exactly: topic, target_person, target_place. "
                                "Use null when unknown. "
                                "Treat 'where should I go' and 'do you know a wise man' as direction/guidance, not lore. "
                                f"{extra_instruction}"
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"/no_think NPC: {npc_name} ({npc_id}). Scene: {scene_id}. "
                                f"Nearby objects: {', '.join(nearby_objects) if nearby_objects else 'none'}. "
                                f"Player line: {user_message}"
                            ),
                        },
                    ],
                    max_completion_tokens=120,
                    temperature=0,
                    timeout_seconds=45,
                )
                payload = _extract_json_object(result.get("raw_content", ""))
                classification = validate_intent_payload(payload, user_message)
                if classification:
                    if re.search(r"\bwise man\b|\bwise elder\b|\bstyrbjorn\b", user_message.lower()) and re.search(r"\b(do you know|where|find|go|looking for|seek)\b", user_message.lower()):
                        classification.intent = "ask_direction"
                    classification = apply_intent_overrides(classification, user_message)
                    log_event("intent_classifier", {
                        "npcId": npc_id,
                        "sceneId": scene_id,
                        "userMessage": user_message,
                        "result": classification.to_dict(),
                        "attempt": attempt_index + 1,
                    })
                    return classification
            except Exception as exc:
                log_event("intent_classifier", {
                    "npcId": npc_id,
                    "sceneId": scene_id,
                    "userMessage": user_message,
                    "error": str(exc),
                    "attempt": attempt_index + 1,
                })

        fallback = apply_intent_overrides(fallback, user_message)
        log_event("intent_classifier", {
            "npcId": npc_id,
            "sceneId": scene_id,
            "userMessage": user_message,
            "result": fallback.to_dict(),
            "reason": "fallback_after_invalid_json",
        })
        return fallback
