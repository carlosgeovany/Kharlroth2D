# Kharlroth2D

Kharlroth2D is the independent browser game repository based on the earlier Kharlroth fork.
It uses Vite and Kaboom, and currently includes the hand-built `home` and `midgard` scenes.

The AI conversation layer now runs through a local Python backend in `python_ai/`. The browser game talks to that backend through Vite proxy routes, and the Python service talks to the local Foundry runtime on this machine.

# How to run

Note: You need `Node.js`, `npm`, and `Python` installed on your machine.

`npm install`

`python -m pip install -r requirements.txt`

Keep Foundry Local running on this machine so the Python bridge can reach `http://127.0.0.1:52844`.

In one terminal:

`npm run ai:dev`

In a second terminal:

`npm run dev`

# How to build

`npm run build`

# How to preview the build

`npm run preview`

# Current structure

- `src/home.js` is the current browser entry scene
- `src/midgard.js` contains the larger exterior map scene
- `public/home.json` and `public/midgard.json` are the scene map data files
- `python_ai/app.py` exposes the local chat endpoints the game uses
- `python_ai/service.py` contains the Python-side conversation orchestration and Foundry bridge

# AI notes

- This is a local-only POC AI stack.
- The game now uses Python for NPC chat orchestration instead of running that logic in the browser.
- Model selection is role-based in `python_ai/service.py`.
  - small/medium Qwen models are preferred for routing, guardrails, validation, and memory
  - stronger Phi / reasoning / larger models are preferred for reply generation and tuning when they are locally available
- If only a small model is loaded in Foundry, the backend falls back to that model automatically.
