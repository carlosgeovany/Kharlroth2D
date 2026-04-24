from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .service import ConversationService


class ReadyResponse(BaseModel):
    selected_models: dict[str, str]


class ChatRequest(BaseModel):
    npc_id: str = Field(alias="npcId")
    scene_id: str = Field(alias="sceneId")
    user_message: str = Field(alias="userMessage")
    nearby_objects: list[str] = Field(default_factory=list, alias="nearbyObjects")
    quest_flags: list[str] = Field(default_factory=list, alias="questFlags")


class ChatResponse(BaseModel):
    response_text: str = Field(alias="responseText")
    route: str
    guardrail_verdict: str = Field(alias="guardrailVerdict")
    validator_status: str = Field(alias="validatorStatus")
    latency_ms: int = Field(alias="latencyMs")
    close_chat: bool = Field(default=False, alias="closeChat")


app = FastAPI(title="Kharlroth Local AI Bridge")
conversation_service = ConversationService()


@app.get("/api/ai/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/ai/ready", response_model=ReadyResponse)
def ready() -> ReadyResponse:
    return ReadyResponse(selected_models=conversation_service.ensure_ready())


@app.post("/api/ai/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    result = conversation_service.send_message(
        npc_id=request.npc_id,
        scene_id=request.scene_id,
        user_message=request.user_message,
        nearby_objects=request.nearby_objects,
        quest_flags=request.quest_flags,
    )
    return ChatResponse(**result)
