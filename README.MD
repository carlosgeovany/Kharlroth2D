# Kharlroth2D

Kharlroth2D is a browser RPG prototype built with Vite and Kaboom.  
The frontend runs the maps, movement, scene transitions, and UI.  
The NPC intelligence runs through a local Python backend that talks to Ollama on your own machine.

## Run The Game

Requirements:

- Node.js + npm
- Python
- Ollama installed and running locally
- Local Ollama models:
  - `phi3.5` for character responses and lore generation
  - `qwen2.5:1.5b` for intent classification and light utility tasks

Install frontend dependencies:

```bash
npm install
```

Start the AI backend:

```bash
npm run ai:dev
```

Start the game:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:4173
```

## Build

```bash
npm run build
```

## AI Architecture

The game uses a local-first dialogue pipeline in `python_ai/`.

### Main pieces

- [app.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/app.py)
  FastAPI entrypoint for `/api/ai/ready` and `/api/ai/chat`
- [service.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/service.py)
  Main conversation service, Ollama bridge, state tracking, and pipeline integration
- [character_data.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/character_data.py)
  Character specs and RAG-style retrieval packs for major NPCs

### Intent system

The backend now classifies player intent before generating a reply.

Modules:

- [intent_classifier.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/intent_classifier.py)
- [intent_router.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/intent_router.py)
- [npc_response_orchestrator.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/npc_response_orchestrator.py)

Supported intents:

- `ask_world_info`
- `ask_character_info`
- `ask_quest_guidance`
- `ask_direction`
- `ask_lore`
- `small_talk`
- `goodbye`
- `unknown`

Intent flow:

1. Player message reaches `/api/ai/chat`
2. Regex guardrails run first
3. `IntentClassifier` asks Ollama for strict JSON intent output
4. JSON is validated
5. If invalid, classifier retries once
6. If still invalid, fallback keyword rules classify the message
7. `IntentRouter` maps the intent to the correct handler
8. `NpcResponseOrchestrator` adds the right response focus and lore requirements
9. Character response is generated with character spec + scene context + optional lore

Example classifier output:

```json
{
  "intent": "ask_lore",
  "confidence": 0.91,
  "entities": {
    "topic": "Fenrir",
    "target_person": null,
    "target_place": null
  }
}
```

## Dynamic Lore System

Lore is generated only when needed and then reused consistently.

Modules:

- [lore_store.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/lore_store.py)
- [lore_retriever.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/lore_retriever.py)
- [lore_generator.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/lore_generator.py)
- [lore_manager.py](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/lore_manager.py)

Persistent store:

- [lore_store.json](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/data/lore_store.json)

Supported lore types:

- `myth_fragment`
- `rumor`
- `historical_note`
- `relic_description`
- `location_legend`
- `character_rumor`

Lore flow:

1. Intent is classified as `ask_lore`
2. Topic is extracted from the classifier entities
3. `LoreRetriever` searches the local lore store by topic, tags, and keyword overlap
4. If a good match exists, that lore entry is reused
5. If not, `LoreGenerator` asks Ollama for strict JSON lore
6. Lore JSON is validated
7. If invalid, generator retries once
8. If generation still fails, a safe fallback lore entry is returned
9. New lore is stored and reused on later interactions

The lore generator obeys these canon constraints:

- Kharlroth is the main hero
- Yrsa is his wife and first guide
- Fenrir spreads fear and despair across Midgard
- Kharlroth must recover relics
- Eirik is a farmer
- Styrbjorn is a wise elder in North Midgard
- The Eye of Odin is in Yggdrasil’s roots guarded by Níðhöggr

## Example Flows

### Eirik: directional guidance

Player:

```text
Do you know a wise man?
```

Pipeline:

- intent -> `ask_direction`
- handler -> directional guidance
- response -> points toward Styrbjorn in North Midgard

### Yrsa: lore generation and reuse

Player:

```text
What do you know about Fenrir?
```

Pipeline:

- intent -> `ask_lore`
- lore store checked first
- if no existing Fenrir lore, new lore is generated and stored
- later Fenrir questions reuse the same stored lore

## Local Models

Current recommended local models:

- `phi3.5`
  main character response model
- `qwen2.5:1.5b`
  intent classifier, light routing, validator/memory utility roles

## Logging

Debug logs are written as JSONL files in:

- [python_ai/logs](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/python_ai/logs)

Current log streams include:

- `intent_classifier`
- `lore_generator`
- `lore_manager`
- `npc_response_orchestrator`

## Smoke Tests

Run the local smoke tests:

```bash
python -m python_ai.smoke_tests
```

They cover:

- fallback intent classification
- JSON validation for intent payloads
- lore generation vs reuse behavior
- basic router/orchestrator integration

## Frontend Notes

The browser chat UI still talks to the same endpoints and does not need to know about the internal AI pipeline changes.

Relevant frontend files:

- [src/ai/conversationOrchestrator.js](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/src/ai/conversationOrchestrator.js)
- [src/ai/sceneConversationRuntime.js](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/src/ai/sceneConversationRuntime.js)
- [src/ai/npcRegistry.js](/c:/Users/cgp23004/OneDrive%20-%20University%20of%20Connecticut/Documents/KharlrothGame/Kharlroth2D/src/ai/npcRegistry.js)
