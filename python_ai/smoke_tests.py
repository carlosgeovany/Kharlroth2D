from __future__ import annotations

import os
import tempfile

from python_ai.intent_classifier import fallback_classify_intent, validate_intent_payload
from python_ai.intent_router import IntentRouter
from python_ai.lore_manager import LoreManager
from python_ai.lore_retriever import LoreRetriever
from python_ai.lore_store import LoreStore
from python_ai.npc_response_orchestrator import NpcResponseOrchestrator


class StubGenerator:
    def __init__(self) -> None:
        self.calls = 0

    def generate(self, *, topic: str, user_message: str, npc_id: str, npc_name: str, scene_id: str):
        self.calls += 1
        return {
            "id": f"generated_{topic.lower()}",
            "title": f"Generated {topic}",
            "type": "rumor",
            "topic": topic,
            "content": f"Rumor says {topic} is stirring again in Midgard.",
            "source_npc": npc_name,
            "scene": scene_id,
            "tags": [topic.lower(), "midgard", "rumor"],
        }


def test_fallback_intents() -> None:
    assert fallback_classify_intent("Where should I go next?").intent == "ask_direction"
    assert fallback_classify_intent("Who is Styrbjorn?").intent == "ask_character_info"
    assert fallback_classify_intent("What is Fenrir?").intent == "ask_lore"
    assert fallback_classify_intent("Goodbye for now").intent == "goodbye"
    assert fallback_classify_intent("good by for now").intent == "goodbye"


def test_intent_payload_validation() -> None:
    payload = {
        "intent": "ask_lore",
        "confidence": 0.91,
        "entities": {
            "topic": "Fenrir",
            "target_person": None,
            "target_place": None,
        },
    }
    result = validate_intent_payload(payload, "What do you know about Fenrir?")
    assert result is not None
    assert result.intent == "ask_lore"
    assert result.entities["topic"] == "Fenrir"


def test_lore_reuse_and_generation() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        store_path = os.path.join(temp_dir, "lore_store.json")
        store = LoreStore(store_path)
        retriever = LoreRetriever(store)
        generator = StubGenerator()
        manager = LoreManager(store, retriever, generator)

        first_entry, first_status = manager.resolve_lore(
            topic="Fenrir",
            user_message="What do you know about Fenrir?",
            npc_id="yrsa",
            npc_name="Yrsa",
            scene_id="home",
        )
        assert first_status == "generated"
        assert generator.calls == 1

        second_entry, second_status = manager.resolve_lore(
            topic="Fenrir",
            user_message="Tell me of Fenrir again.",
            npc_id="yrsa",
            npc_name="Yrsa",
            scene_id="home",
        )
        assert second_status == "reused"
        assert second_entry["id"] == first_entry["id"]
        assert generator.calls == 1


def test_router_and_orchestrator() -> None:
    class StubLoreManager:
        def resolve_lore(self, **_: object):
            return {
                "id": "lore_fenrir_001",
                "title": "Whispers of Fenrir",
                "type": "myth_fragment",
                "topic": "Fenrir",
                "content": "Fenrir spreads fear through Midgard.",
                "source_npc": "Yrsa",
                "scene": "home",
                "tags": ["fenrir", "midgard"],
            }, "reused"

    router = IntentRouter()
    orchestrator = NpcResponseOrchestrator(router, StubLoreManager())
    classification = validate_intent_payload({
        "intent": "ask_lore",
        "confidence": 0.9,
        "entities": {"topic": "Fenrir", "target_person": None, "target_place": None},
    }, "What do you know about Fenrir?")
    assert classification is not None

    character_ref = type("CharacterRef", (), {
        "definition": {"name": "Yrsa"},
    })()
    context = orchestrator.build_handler_context(
        classification=classification,
        character_ref=character_ref,
        npc_id="yrsa",
        scene_id="home",
        user_message="What do you know about Fenrir?",
    )
    assert context["handler_name"] == "handle_lore"
    assert context["lore_status"] == "reused"
    assert context["lore_entry"]["topic"] == "Fenrir"


def main() -> None:
    test_fallback_intents()
    test_intent_payload_validation()
    test_lore_reuse_and_generation()
    test_router_and_orchestrator()
    print("python_ai smoke tests passed.")


if __name__ == "__main__":
    main()
