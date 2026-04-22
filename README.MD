# Kharlroth2D

Kharlroth2D is the independent browser game repository based on the earlier Kharlroth fork.
It uses Vite and Kaboom, and currently includes the hand-built `home` and `midgard` scenes.

The AI conversation layer now runs through a local Python backend in `python_ai/`. The browser game talks to that backend through Vite proxy routes, and the Python service manages a local `llama.cpp` runtime that pulls GGUF models from Hugging Face.

# How to run

Note: You need `Node.js`, `npm`, `Python`, and `llama.cpp` installed on your machine.

`npm install`

`python -m pip install -r requirements.txt`

Install `llama.cpp` locally. The current implementation expects `llama-server.exe` to be available from the `winget` install path.

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
- `python_ai/service.py` contains the Python-side conversation orchestration and the managed `llama-server` bridge

# AI notes

- This is a local-only POC AI stack.
- The game now uses Python for NPC chat orchestration instead of running that logic in the browser.
- The backend no longer depends on Foundry for model download or inference.
- `llama-server` is started on demand by the Python backend and serves a Hugging Face GGUF model locally.
- The current default model is `Qwen/Qwen2.5-3B-Instruct-GGUF` with `qwen2.5-3b-instruct-q4_k_m.gguf`.
- The first warm-up can take a while because the model is downloaded into the local Hugging Face cache on first use.
