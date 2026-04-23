from __future__ import annotations

from typing import Any

from .debug_logger import log_event


class NpcResponseOrchestrator:
    def __init__(self, intent_router: Any, lore_manager: Any) -> None:
        self.intent_router = intent_router
        self.lore_manager = lore_manager

    def build_handler_context(
        self,
        *,
        classification: Any,
        character_ref: Any,
        npc_id: str,
        scene_id: str,
        user_message: str,
    ) -> dict[str, Any]:
        route = self.intent_router.route(classification)
        topic = (
            classification.entities.get("topic")
            or classification.entities.get("target_person")
            or classification.entities.get("target_place")
        )

        extra_instructions = [route.response_focus]
        lore_entry = None
        lore_status = None

        if route.handler_name == "handle_direction":
            extra_instructions.append(
                "Favor practical directions and named people or places the NPC actually knows."
            )
        elif route.handler_name == "handle_quest_guidance":
            extra_instructions.append(
                "Give guidance toward the next meaningful person or place, but keep it in character and not like a quest log."
            )
        elif route.handler_name == "handle_character_info":
            extra_instructions.append(
                "Answer about the named person honestly from the NPC's own knowledge and relationship to them."
            )
        elif route.handler_name == "handle_world_info":
            extra_instructions.append(
                "Describe the world, the local people, and the present unease as the NPC would truly know it."
            )
        elif route.handler_name == "handle_small_talk":
            extra_instructions.append(
                "Keep it brief, warm, and ordinary."
            )
        elif route.handler_name == "handle_unknown":
            extra_instructions.append(
                "If the question is vague, answer what the NPC can honestly say and gently steer toward known topics."
            )
        elif route.handler_name == "handle_goodbye":
            farewell = (
                "Walk steady, then. If the road troubles you again, come back and ask."
                if npc_id == "eirik"
                else "Go with care, my love. The hearth will remember your steps."
            )
            return {
                "handler_name": route.handler_name,
                "close_chat": True,
                "response_text": farewell,
                "route_label": f"intent:{classification.intent}",
                "extra_instructions": [],
                "lore_entry": None,
                "lore_status": None,
            }

        if route.use_lore:
            resolved_topic = topic or "Midgard"
            lore_entry, lore_status = self.lore_manager.resolve_lore(
                topic=resolved_topic,
                user_message=user_message,
                npc_id=npc_id,
                npc_name=character_ref.definition["name"],
                scene_id=scene_id,
            )
            extra_instructions.append(
                f"Relevant lore to weave in carefully: {lore_entry['title']} ({lore_entry['type']}) - {lore_entry['content']}"
            )
            extra_instructions.append(
                "Use this lore consistently, but keep the answer in the NPC's own limits and voice."
            )
            if npc_id == "eirik":
                extra_instructions.append(
                    "You are not a myth-keeper or scholar. If the player asks about relics, Fenrir, Yggdrasil, Odin, or other deeper lore, admit your limits plainly and point them toward Styrbjorn in North Midgard rather than explaining too much."
                )
            if npc_id == "yrsa":
                extra_instructions.append(
                    "You may speak of Fenrir, fear, relics, and imbalance with confidence, but do not reveal exact relic locations or deeper hidden truths you do not know."
                )

        log_event("npc_response_orchestrator", {
            "npcId": npc_id,
            "sceneId": scene_id,
            "intent": classification.intent,
            "handler": route.handler_name,
            "topic": topic,
            "loreStatus": lore_status,
        })
        return {
            "handler_name": route.handler_name,
            "close_chat": route.close_chat,
            "response_text": None,
            "route_label": f"intent:{classification.intent}",
            "extra_instructions": extra_instructions,
            "lore_entry": lore_entry,
            "lore_status": lore_status,
        }
