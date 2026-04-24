# Cleanup Removals - 2026-04-24

This file tracks files and folders removed during the unused-file cleanup pass.

## Verification Before Removal

Before each removal batch, these checks were run successfully:

```bash
python -m python_ai.smoke_tests
npm run build
```

## Removed Tracked Source/Project Files

These files were removed because they belonged to older Foundry/browser-side prompt tuning or unused map data paths. They can be restored from git if needed.

Restore example:

```bash
git restore --source=fd4b113 -- path/to/file
```

Removed paths:

- `character-seeds/yrsa.json`
- `generated-character-packs/.gitkeep`
- `generated-character-packs/yrsa.json`
- `scripts/tune-character.mjs`
- `src/ai/characterAgentRuntime.js`
- `src/ai/characterKnowledge.js`
- `src/ai/foundryClient.js`
- `src/ai/promptTunerAgent.js`
- `public/map.json`
- `dist/map.json`

Related edits:

- `package.json`: removed the obsolete `tune:character` script.
- `src/main.js`: changed the stale Foundry warmup warning to a generic local AI warning.
- `README.MD`: removed the obsolete prompt tuning section and refreshed repository notes.

## Removed Generated/Diagnostic Artifacts

These were local generated artifacts and diagnostics, not active source. They are recreated by Python or logging code when needed.

- `foundry_diag_20260422/`
- `python_ai/__pycache__/`
- `python_ai/logs/`

## Preserved On Purpose

- `public/*.png` and other image files were left untouched.
- `backups/` was left untouched and remains local/untracked.
- `public/jormungandr.json` was preserved because it is current map data, even though it is not registered as a playable scene yet.
