from __future__ import annotations

from typing import Any

from .debug_logger import log_event


class LoreManager:
    def __init__(self, store: Any, retriever: Any, generator: Any) -> None:
        self.store = store
        self.retriever = retriever
        self.generator = generator

    def resolve_lore(
        self,
        *,
        topic: str,
        user_message: str,
        npc_id: str,
        npc_name: str,
        scene_id: str,
    ) -> tuple[dict[str, Any], str]:
        existing_entry = self.retriever.find_best_match(
            topic=topic,
            user_message=user_message,
            scene_id=scene_id,
            npc_name=npc_name,
        )
        if existing_entry:
            log_event("lore_manager", {
                "topic": topic,
                "npcId": npc_id,
                "sceneId": scene_id,
                "status": "reused",
                "entryId": existing_entry.get("id"),
            })
            return existing_entry, "reused"

        generated_entry = self.generator.generate(
            topic=topic,
            user_message=user_message,
            npc_id=npc_id,
            npc_name=npc_name,
            scene_id=scene_id,
        )
        self.store.save_entry(generated_entry)
        log_event("lore_manager", {
            "topic": topic,
            "npcId": npc_id,
            "sceneId": scene_id,
            "status": "generated",
            "entryId": generated_entry.get("id"),
        })
        return generated_entry, "generated"
