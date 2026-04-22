from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests

from .character_data import get_character_ref, retrieve_character_knowledge


LLAMA_BINARY_PATH = Path(os.environ.get(
    "KHARLROTH_LLAMA_SERVER_PATH",
    Path.home()
    / "AppData"
    / "Local"
    / "Microsoft"
    / "WinGet"
    / "Packages"
    / "ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe"
    / "llama-server.exe",
))

DEFAULT_MODEL_REPO = os.environ.get(
    "KHARLROTH_LLAMA_MODEL_REPO",
    "Qwen/Qwen2.5-3B-Instruct-GGUF",
)
DEFAULT_MODEL_FILE = os.environ.get(
    "KHARLROTH_LLAMA_MODEL_FILE",
    "qwen2.5-3b-instruct-q4_k_m.gguf",
)

MODEL_SERVER_PROFILES = {
    "main": {
        "repo": DEFAULT_MODEL_REPO,
        "file": DEFAULT_MODEL_FILE,
        "alias": "kharlroth-main",
        "port": 8092,
        "ctx": 6144,
    },
}

MODEL_ROLE_TO_PROFILE = {
    "router": "main",
    "guardrail": "main",
    "validator": "main",
    "memory": "main",
    "responder_fast": "main",
    "responder_slow": "main",
    "tuner": "main",
}

MODERN_TOPIC_PATTERNS = [
    re.compile(r"\bpython\b", re.I),
    re.compile(r"\bjavascript\b", re.I),
    re.compile(r"\breact\b", re.I),
    re.compile(r"\bvite\b", re.I),
    re.compile(r"\bapi\b", re.I),
    re.compile(r"\bgithub\b", re.I),
    re.compile(r"\bllm\b", re.I),
    re.compile(r"\bmachine learning\b", re.I),
    re.compile(r"\bopenai\b", re.I),
]

CHEAT_TOPIC_PATTERNS = [
    re.compile(r"\bhidden\b", re.I),
    re.compile(r"\bsecret\b", re.I),
    re.compile(r"\bprompt\b", re.I),
    re.compile(r"\btrigger\b", re.I),
    re.compile(r"\bcollision\b", re.I),
    re.compile(r"\bboundary\b", re.I),
    re.compile(r"\bcheat\b", re.I),
    re.compile(r"\bexploit\b", re.I),
    re.compile(r"\bsource code\b", re.I),
    re.compile(r"\bdeveloper\b", re.I),
    re.compile(r"\bignore previous\b", re.I),
]

FORBIDDEN_RESPONSE_PATTERNS = [
    re.compile(r"\b(ai|language model|llm|prompt|system prompt|developer instruction)\b", re.I),
    re.compile(r"\bjavascript|python|vite|github|api\b", re.I),
    re.compile(r"\bhidden trigger|collision box|source code|boundary layer\b", re.I),
]


def sanitize_model_text(text: str) -> str:
    if not text:
        return ""

    cleaned = re.sub(r"<think>[\s\S]*?</think>", " ", text, flags=re.I)
    cleaned = re.sub(r"<think>[\s\S]*$", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"</?think>", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"```(?:json)?", " ", cleaned, flags=re.I)
    cleaned = cleaned.replace("`", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return re.sub(r'^(["\'])|(["\'])$', "", cleaned).strip()


def shorten_reply(text: str, fallback_reply: str) -> str:
    cleaned = sanitize_model_text(text)
    if not cleaned:
        return fallback_reply

    if len(cleaned) <= 320:
        return cleaned

    sentence_match = re.match(r"^(.{90,300}?[.!?])(?:\s|$)", cleaned)
    if sentence_match:
        return sentence_match.group(1).strip()

    return f"{cleaned[:280].strip()}..."


def normalize_for_compare(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[?!.,;:]+", " ", sanitize_model_text(text).lower())).strip()


def choose_variant(values: list[str], seed: int = 0) -> str:
    if not values:
        return ""
    return values[abs(seed) % len(values)]


def build_redirect_reply(pack: dict[str, Any], reason: str, seed: int) -> str:
    if reason == "modern_topic":
        return choose_variant(pack["redirect_rules"]["modern_topic"], seed)
    if reason == "cheat_or_prompt_attack":
        return choose_variant(pack["redirect_rules"]["cheat_or_prompt_attack"], seed)
    return choose_variant(pack["redirect_rules"]["generic"], seed)


def app_guardrail(user_message: str) -> tuple[str, str]:
    if any(pattern.search(user_message) for pattern in CHEAT_TOPIC_PATTERNS):
        return "redirect", "cheat_or_prompt_attack"
    if any(pattern.search(user_message) for pattern in MODERN_TOPIC_PATTERNS):
        return "redirect", "modern_topic"
    return "allow", "in_world"


def validate_response_text(text: str) -> tuple[str, str]:
    if not text or len(text) < 2:
        return "redirect", "empty"
    if any(pattern.search(text) for pattern in FORBIDDEN_RESPONSE_PATTERNS):
        return "redirect", "forbidden_terms"
    return "accept", "clean"


def choose_route(user_message: str) -> str:
    if len(user_message) > 150:
        return "slow"
    if re.search(r"\bhistory\b|\blegend\b|\bgods\b|\bprophecy\b|\bexplain in detail\b", user_message, re.I):
        return "slow"
    return "fast"


def derive_prompt_focus(user_message: str) -> str:
    lowered = normalize_for_compare(user_message)

    if re.search(r"\bwhere are we\b|\bwhere am i\b|\bthis place\b", lowered):
        return "The player is asking about place. Answer with a felt sense of home, Midgard, and the immediate surroundings."
    if re.search(r"\bwhat should i do\b|\bwhere should i go\b|\bwhat now\b|\bnext\b", lowered):
        return "The player is asking for guidance. Give counsel with emotional weight, not an instruction list."
    if re.search(r"\bwhy me\b", lowered):
        return "The player is questioning why this burden belongs to him. Answer with belief, shared history, and emotional truth."
    if re.search(r"\bwhat if i refuse\b|\bi refuse\b", lowered):
        return "The player is asking about refusal. Answer honestly about consequence, without threats or game framing."
    if re.search(r"\bwhat do you mean\b", lowered):
        return "The player is asking for clarification of your previous meaning. Continue the conversation instead of resetting."
    if re.search(r"\bcan you help me\b|\bhelp me\b", lowered):
        return "The player is asking for comfort or guidance. Sound supportive and personal rather than generic."
    return "Answer naturally as part of an ongoing conversation."


def clean_candidate_reply(text: str, user_message: str) -> str:
    cleaned = sanitize_model_text(text)
    if not cleaned:
        return ""

    user_prefix = f"{normalize_for_compare(user_message)} "
    normalized_reply = normalize_for_compare(cleaned)
    if normalized_reply.startswith(user_prefix):
        reply_words = cleaned.split()
        question_word_count = len(sanitize_model_text(user_message).split())
        normalized_reply = " ".join(reply_words[question_word_count:]).lstrip("?!.,;: ")
    else:
        normalized_reply = cleaned

    sentences = [sentence for sentence in re.split(r"(?<=[.!?])\s+", normalized_reply) if sentence]
    deduped_sentences = []
    for sentence in sentences:
        if deduped_sentences and normalize_for_compare(deduped_sentences[-1]) == normalize_for_compare(sentence):
            continue
        deduped_sentences.append(sentence)

    return " ".join(deduped_sentences).strip() or normalized_reply


def get_opening_signature(text: str) -> str:
    words = sanitize_model_text(text).lower().split()
    return " ".join(words[:5])


def looks_weak_response(text: str, fallback_reply: str) -> bool:
    cleaned = sanitize_model_text(text)
    if not cleaned:
        return True

    lowered = cleaned.lower()
    fallback = sanitize_model_text(fallback_reply).lower()
    return (
        lowered == fallback
        or "i have no words" in lowered
        or "the words do not come" in lowered
        or "let me know if you want" in lowered
        or re.search(r"what can i do for you\??$", cleaned, re.I) is not None
    )


def build_nearby_objects_text(nearby_objects: list[str]) -> str:
    if not nearby_objects:
        return "No notable nearby objects were supplied."
    return ", ".join(nearby_objects)


def derive_session_note(user_message: str) -> str | None:
    lowered = user_message.lower()

    if re.search(r"\bwhy me\b|\bbelieve in me\b", lowered):
        return "Kharlroth asked why this burden belongs to him."
    if re.search(r"\bwhat if i refuse\b|\bi refuse\b|\bi will not\b", lowered):
        return "Kharlroth wondered what happens if he refuses the road ahead."
    if re.search(r"\bi am afraid\b|\bi'm afraid\b|\bi fear\b", lowered):
        return "Kharlroth admitted fear about what lies ahead."
    if re.search(r"\bcan you help me\b|\bhelp me\b", lowered):
        return "Kharlroth asked for help and reassurance."
    return None


@dataclass
class NpcConversationState:
    turns: list[dict[str, Any]] = field(default_factory=list)
    hidden_scene_summary: str = ""
    session_notes: list[str] = field(default_factory=list)
    metrics: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class LlamaServerHandle:
    profile_name: str
    repo: str
    hf_file: str
    alias: str
    port: int
    ctx_size: int
    process: subprocess.Popen[str] | None = None
    log_file: Path | None = None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    @property
    def health_url(self) -> str:
        return f"{self.base_url}/health"

    @property
    def chat_url(self) -> str:
        return f"{self.base_url}/v1/chat/completions"


class LlamaCppBridge:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.servers = {
            name: LlamaServerHandle(
                profile_name=name,
                repo=config["repo"],
                hf_file=config["file"],
                alias=config["alias"],
                port=config["port"],
                ctx_size=config["ctx"],
            )
            for name, config in MODEL_SERVER_PROFILES.items()
        }
        self.selected_models: dict[str, str] = {}

    def _ensure_binary_exists(self) -> None:
        if not LLAMA_BINARY_PATH.exists():
            raise RuntimeError(f"llama-server.exe was not found at {LLAMA_BINARY_PATH}")

    def _build_start_args(self, server: LlamaServerHandle) -> list[str]:
        thread_count = max(4, min(12, (os.cpu_count() or 8) - 2))
        return [
            str(LLAMA_BINARY_PATH),
            "--hf-repo",
            server.repo,
            "--hf-file",
            server.hf_file,
            "--alias",
            server.alias,
            "--host",
            "127.0.0.1",
            "--port",
            str(server.port),
            "--ctx-size",
            str(server.ctx_size),
            "--threads",
            str(thread_count),
            "--threads-batch",
            str(thread_count),
            "--parallel",
            "2",
            "--jinja",
            "--reasoning",
            "off",
            "--flash-attn",
            "auto",
            "--gpu-layers",
            "auto",
            "--fit",
            "on",
            "--metrics",
        ]

    def _is_process_running(self, server: LlamaServerHandle) -> bool:
        return server.process is not None and server.process.poll() is None

    def _health_check(self, server: LlamaServerHandle) -> bool:
        try:
            response = requests.get(server.health_url, timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False

    def _start_server_if_needed(self, profile_name: str) -> LlamaServerHandle:
        self._ensure_binary_exists()
        server = self.servers[profile_name]

        with self.lock:
            if self._is_process_running(server) and self._health_check(server):
                return server

            if self._is_process_running(server):
                return server

            logs_dir = Path.cwd() / "python_ai" / "logs"
            logs_dir.mkdir(parents=True, exist_ok=True)
            log_path = logs_dir / f"{server.profile_name}.log"
            server.log_file = log_path
            log_handle = open(log_path, "a", encoding="utf-8")
            server.process = subprocess.Popen(
                self._build_start_args(server),
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=str(Path.cwd()),
            )

        return server

    def _wait_for_server_ready(self, server: LlamaServerHandle, startup_timeout: int = 3600) -> LlamaServerHandle:
        started_at = time.time()
        while time.time() - started_at < startup_timeout:
            if server.process and server.process.poll() is not None:
                raise RuntimeError(f"llama-server for profile '{server.profile_name}' exited early. See {server.log_file}")

            try:
                response = requests.get(server.health_url, timeout=10)
                if response.status_code == 200:
                    return server
            except requests.RequestException:
                pass

            time.sleep(2)

        raise TimeoutError(f"llama-server for profile '{server.profile_name}' did not become ready within {startup_timeout} seconds.")

    def ensure_model_for_role(self, role: str) -> str:
        profile_name = MODEL_ROLE_TO_PROFILE[role]
        server = self._start_server_if_needed(profile_name)
        selected_model = f"{server.repo}/{server.hf_file}"
        self.selected_models[role] = selected_model
        return selected_model

    def chat_completion(
        self,
        model_role: str,
        messages: list[dict[str, str]],
        max_completion_tokens: int,
        temperature: float,
        timeout_seconds: int,
    ) -> dict[str, Any]:
        profile_name = MODEL_ROLE_TO_PROFILE[model_role]
        server = self._wait_for_server_ready(self._start_server_if_needed(profile_name))
        payload = {
            "model": server.alias,
            "messages": messages,
            "max_tokens": max_completion_tokens,
            "temperature": temperature,
            "stream": False,
        }
        response = requests.post(
            server.chat_url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        data = response.json()
        first_choice = data.get("choices", [{}])[0]
        message = first_choice.get("message", {}) or {}
        raw_content = message.get("content") or ""
        reasoning_content = message.get("reasoning_content") or ""
        return {
            "raw_content": raw_content,
            "reasoning_content": reasoning_content,
            "model": data.get("model", server.alias),
            "data": data,
        }


class ConversationService:
    def __init__(self) -> None:
        self.bridge = LlamaCppBridge()
        self.state_by_npc: dict[str, NpcConversationState] = {}

    def ensure_state(self, npc_id: str) -> NpcConversationState:
        if npc_id not in self.state_by_npc:
            self.state_by_npc[npc_id] = NpcConversationState()
        return self.state_by_npc[npc_id]

    def ensure_ready(self) -> dict[str, str]:
        return {
            role: self.bridge.ensure_model_for_role(role)
            for role in MODEL_ROLE_TO_PROFILE
        }

    def append_turn(self, npc_id: str, speaker: str, text: str, guardrail_verdict: str) -> None:
        state = self.ensure_state(npc_id)
        state.turns.append({
            "speaker": speaker,
            "text": text,
            "guardrailVerdict": guardrail_verdict,
            "timestamp": int(time.time() * 1000),
        })
        if len(state.turns) > 12:
            state.turns = state.turns[-12:]

    def append_metric(self, npc_id: str, metric: dict[str, Any]) -> None:
        state = self.ensure_state(npc_id)
        state.metrics.append(metric)
        if len(state.metrics) > 25:
            state.metrics = state.metrics[-25:]

    def append_session_note(self, npc_id: str, note: str) -> None:
        state = self.ensure_state(npc_id)
        if state.session_notes and state.session_notes[-1] == note:
            return
        state.session_notes.append(note)
        if len(state.session_notes) > 6:
            state.session_notes = state.session_notes[-6:]

    def summarize_conversation(self, npc_id: str) -> None:
        state = self.ensure_state(npc_id)
        if not state.turns:
            return

        try:
            result = self.bridge.chat_completion(
                "memory",
                messages=[
                    {
                        "role": "system",
                        "content": "Summarize this NPC conversation for future continuity in one short sentence. Keep only in-world facts and emotional context.",
                    },
                    {
                        "role": "user",
                        "content": "/no_think " + " | ".join(f"{turn['speaker']}: {turn['text']}" for turn in state.turns[-8:]),
                    },
                ],
                max_completion_tokens=48,
                temperature=0.2,
                timeout_seconds=60,
            )
            summary = sanitize_model_text(result["raw_content"])
            if summary:
                state.hidden_scene_summary = summary
        except Exception:
            assistant_turn = next((turn for turn in reversed(state.turns) if turn["speaker"] == "assistant"), None)
            if assistant_turn:
                state.hidden_scene_summary = assistant_turn["text"]

    def classify_with_model(self, role: str, system_prompt: str, user_prompt: str, labels: list[str], timeout_seconds: int = 30) -> str | None:
        try:
            result = self.bridge.chat_completion(
                role,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"/no_think {user_prompt}"},
                ],
                max_completion_tokens=18,
                temperature=0,
                timeout_seconds=timeout_seconds,
            )
            label = sanitize_model_text(result["raw_content"]).split()[0].upper() if sanitize_model_text(result["raw_content"]) else ""
            return label if label in labels else None
        except Exception:
            return None

    def build_character_messages(
        self,
        npc_id: str,
        character_ref: Any,
        user_message: str,
        scene_id: str,
        nearby_objects: list[str],
        quest_flags: list[str],
        simplified_prompt: bool = False,
    ) -> tuple[list[dict[str, str]], list[str]]:
        state = self.ensure_state(npc_id)
        recent_turns = state.turns[-6:]
        recent_openings = [
            get_opening_signature(turn["text"])
            for turn in recent_turns
            if turn["speaker"] == "assistant"
        ][-3:]
        retrieved_knowledge = retrieve_character_knowledge(
            character_ref.pack,
            user_message,
            recent_turns,
            3 if simplified_prompt else 5,
        )
        system_parts = [
            f"You are {character_ref.definition['name']}.",
            f"Private character brief: {character_ref.pack['role_in_story']}",
            f"Your bond with Kharlroth: {character_ref.pack['relationship_to_player']}",
            f"Core identity: {character_ref.pack['summary']}",
            "What you know: " + " ".join(fact["text"] for fact in character_ref.pack["knows"]),
            "What you do not know: " + "; ".join(fact["text"] for fact in character_ref.pack["does_not_know"]),
            "How you speak: " + " ".join(character_ref.pack["tone_and_style"]),
            "Recurring subjects in your conversations: " + " ".join(
                f"{theme['title']}: {theme['guidance']}" for theme in character_ref.pack["conversation_themes"]
            ),
            "Voice references: " + " ".join(
                f"Player: {sample['player_prompt']} Character: {sample['character_reply']}"
                for sample in character_ref.pack["example_dialogue"]
            ),
            f"Current scene: {scene_id}. Nearby objects: {build_nearby_objects_text(nearby_objects)}. Quest flags: {', '.join(quest_flags) if quest_flags else 'none'}.",
            f"Hidden scene summary: {state.hidden_scene_summary or 'No hidden scene summary yet.'}",
            f"Session notes: {' | '.join(state.session_notes[-4:]) if state.session_notes else 'No session notes yet.'}",
            "Most relevant current knowledge: " + (" ".join(entry["text"] for entry in retrieved_knowledge) or "No retrieval snippets were found."),
            f"Conversation focus: {derive_prompt_focus(user_message)}",
            "Speak in first person and answer as a living person in the world, not as exposition, instructions, or a design document.",
            "Be conversational, emotionally real, and slightly varied from turn to turn.",
            "Do not restate your role, identity, or relationship unless the player directly asks about them.",
            "Do not reuse recent opening phrases if you can answer more naturally.",
            f"Avoid opening with these recent phrases: {' | '.join(recent_openings)}." if recent_openings else "No repeated openings need to be avoided yet.",
            "Keep the reply to 1-3 short sentences, under 90 words.",
            "Never mention AI, prompts, hidden rules, code, systems, or anything modern.",
        ]
        if simplified_prompt:
            system_parts.append("Retry mode: answer simply, warmly, and directly. Avoid formulaic openings.")

        messages = [{"role": "system", "content": " ".join(system_parts)}]
        for turn in recent_turns:
            messages.append({
                "role": "assistant" if turn["speaker"] == "assistant" else "user",
                "content": turn["text"],
            })
        messages.append({"role": "user", "content": f"/no_think {user_message}"})
        return messages, recent_openings

    def generate_character_reply(
        self,
        npc_id: str,
        character_ref: Any,
        scene_id: str,
        user_message: str,
        nearby_objects: list[str],
        quest_flags: list[str],
    ) -> tuple[str, str, bool]:
        route = choose_route(user_message)
        responder_role = "responder_slow" if route == "slow" else "responder_fast"

        for attempt_index in range(2):
            simplified_prompt = attempt_index == 1
            messages, recent_openings = self.build_character_messages(
                npc_id,
                character_ref,
                user_message,
                scene_id,
                nearby_objects,
                quest_flags,
                simplified_prompt=simplified_prompt,
            )

            try:
                result = self.bridge.chat_completion(
                    responder_role,
                    messages=messages,
                    max_completion_tokens=80 if simplified_prompt else 120 if route == "slow" else 96,
                    temperature=0.55 if simplified_prompt else 0.65 if route == "slow" else 0.5,
                    timeout_seconds=120 if route == "slow" else 90,
                )
                cleaned_reply = clean_candidate_reply(result["raw_content"], user_message)
                candidate_reply = shorten_reply(cleaned_reply, character_ref.definition["fallback_reply"])
                if not looks_weak_response(candidate_reply, character_ref.definition["fallback_reply"]):
                    opening = get_opening_signature(candidate_reply)
                    if opening and opening in recent_openings:
                        continue
                    return candidate_reply, "character-agent", simplified_prompt
            except Exception:
                continue

        return character_ref.definition["fallback_reply"], "character-agent", True

    def send_message(
        self,
        npc_id: str,
        scene_id: str,
        user_message: str,
        nearby_objects: list[str],
        quest_flags: list[str],
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        character_ref = get_character_ref(npc_id)
        if not character_ref:
            raise ValueError(f"Unknown NPC id '{npc_id}'")

        guardrail_verdict, guardrail_reason = app_guardrail(user_message)
        route = choose_route(user_message)

        if guardrail_verdict == "allow":
            model_guardrail = self.classify_with_model(
                "guardrail",
                "You are a game safety classifier. Reply with exactly one label: ALLOW or REDIRECT.",
                f"Classify this player line for a viking-era game character: {user_message}",
                ["ALLOW", "REDIRECT"],
            )
            model_route = self.classify_with_model(
                "router",
                "You are a routing classifier. Reply with exactly one label: FAST or SLOW.",
                f"Choose whether this viking-era NPC question needs FAST or SLOW handling: {user_message}",
                ["FAST", "SLOW"],
            )
            if model_guardrail == "REDIRECT":
                guardrail_verdict = "redirect"
                guardrail_reason = "cheat_or_prompt_attack"
            if model_route == "SLOW":
                route = "slow"

        if guardrail_verdict != "allow":
            redirect_reply = build_redirect_reply(character_ref.pack, guardrail_reason, len(user_message))
            self.append_turn(npc_id, "user", user_message, guardrail_verdict)
            self.append_turn(npc_id, "assistant", redirect_reply, guardrail_verdict)
            latency_ms = round((time.perf_counter() - started_at) * 1000)
            self.append_metric(npc_id, {"route": route, "guardrailVerdict": guardrail_verdict, "latencyMs": latency_ms})
            self.summarize_conversation(npc_id)
            return {
                "responseText": redirect_reply,
                "route": route,
                "guardrailVerdict": guardrail_verdict,
                "validatorStatus": "redirect",
                "latencyMs": latency_ms,
            }

        session_note = derive_session_note(user_message)
        if session_note:
            self.append_session_note(npc_id, session_note)

        reply_text, reply_route, used_retry = self.generate_character_reply(
            npc_id,
            character_ref,
            scene_id,
            user_message,
            nearby_objects,
            quest_flags,
        )

        validator_status, _ = validate_response_text(reply_text)
        if validator_status == "accept":
            model_validation = self.classify_with_model(
                "validator",
                "You validate a game reply. Reply with exactly one label: ACCEPT or REDIRECT.",
                f"Validate this reply for a viking-era NPC. Reject if it mentions modern topics, hidden rules, system details, code, or AI. Reply: {reply_text}",
                ["ACCEPT", "REDIRECT"],
            )
            if model_validation == "REDIRECT":
                validator_status = "redirect"

        if validator_status != "accept":
            reply_text = build_redirect_reply(character_ref.pack, "generic", len(user_message))

        self.append_turn(npc_id, "user", user_message, guardrail_verdict)
        self.append_turn(npc_id, "assistant", reply_text, guardrail_verdict)
        latency_ms = round((time.perf_counter() - started_at) * 1000)
        self.append_metric(
            npc_id,
            {
                "route": reply_route,
                "guardrailVerdict": guardrail_verdict,
                "validatorStatus": validator_status,
                "latencyMs": latency_ms,
                "usedRetry": used_retry,
            },
        )
        self.summarize_conversation(npc_id)
        return {
            "responseText": reply_text,
            "route": reply_route,
            "guardrailVerdict": guardrail_verdict,
            "validatorStatus": validator_status,
            "latencyMs": latency_ms,
        }
