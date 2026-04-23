from __future__ import annotations

from dataclasses import dataclass

from .intent_classifier import IntentClassification


@dataclass
class IntentRoute:
    handler_name: str
    response_focus: str
    use_lore: bool = False
    close_chat: bool = False


class IntentRouter:
    def route(self, classification: IntentClassification) -> IntentRoute:
        intent = classification.intent

        if intent == "ask_lore":
            return IntentRoute(
                handler_name="handle_lore",
                response_focus="Answer through the NPC's own knowledge and voice, using persistent lore when it exists.",
                use_lore=True,
            )
        if intent == "ask_direction":
            return IntentRoute(
                handler_name="handle_direction",
                response_focus="Give practical directions using known places, paths, and people. Prefer clear next steps over exposition.",
            )
        if intent == "ask_quest_guidance":
            return IntentRoute(
                handler_name="handle_quest_guidance",
                response_focus="Guide the player toward the next meaningful person or place without sounding like a quest log.",
            )
        if intent == "ask_character_info":
            return IntentRoute(
                handler_name="handle_character_info",
                response_focus="Answer about people and relationships in a grounded, in-world way.",
            )
        if intent == "ask_world_info":
            return IntentRoute(
                handler_name="handle_world_info",
                response_focus="Describe the local world, the people, and the current unease in a grounded way.",
            )
        if intent == "small_talk":
            return IntentRoute(
                handler_name="handle_small_talk",
                response_focus="Answer warmly and briefly in character, with everyday concerns and a little personality.",
            )
        if intent == "goodbye":
            return IntentRoute(
                handler_name="handle_goodbye",
                response_focus="Offer a brief in-world farewell.",
                close_chat=True,
            )
        return IntentRoute(
            handler_name="handle_unknown",
            response_focus="Answer in character, but gently steer toward what the NPC truly knows.",
        )
