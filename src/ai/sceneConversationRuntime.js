import { scaleFactor } from "../constants.js";
import { k } from "../kaboomCtx.js";
import { chatPanel } from "../ui/chatPanel.js";
import { conversationOrchestrator } from "./conversationOrchestrator.js";
import { conversationStateStore } from "./conversationStateStore.js";
import { getSceneNpcs } from "./npcRegistry.js";

function buildNearbyObjects(sceneName, npcId) {
  if (sceneName === "home" && npcId === "yrsa") {
    return ["hearth", "table", "shelves", "throne", "household tools"];
  }

  if (sceneName === "midgard" && npcId === "eirik") {
    return ["house path", "lake", "ridge", "cave", "open field"];
  }

  return [];
}

function seedGreeting(npc) {
  const turns = conversationStateStore.getTurns(npc.id);
  if (turns.length) {
    return;
  }

  conversationStateStore.appendTurn(npc.id, {
    speaker: "assistant",
    text: npc.greeting,
    guardrailVerdict: "allow",
  });
}

function addNpcSprite(npc, boundaryAnchors) {
  if (!npc.sprite) {
    return null;
  }

  const boundaryAnchor = npc.triggerBoundary
    ? boundaryAnchors[npc.triggerBoundary] ?? null
    : null;
  const spriteX = boundaryAnchor
    ? boundaryAnchor.x + boundaryAnchor.width / 2
    : npc.x;
  const spriteY = boundaryAnchor
    ? boundaryAnchor.y + boundaryAnchor.height / 2
    : npc.y;

  if (typeof spriteX !== "number" || typeof spriteY !== "number") {
    return null;
  }

  return k.add([
    k.sprite(npc.sprite, { frame: npc.frame }),
    k.area({
      shape: new k.Rect(k.vec2(10, 18), 12, 10),
    }),
    k.anchor("center"),
    k.pos(spriteX * scaleFactor, spriteY * scaleFactor),
    k.scale(scaleFactor),
    {
      npcDefinition: npc,
      update() {
        if (npc.flipX) {
          this.flipX = true;
        }
      },
    },
    "talkable-npc",
  ]);
}

export function createSceneConversationRuntime({
  sceneName,
  player,
  pausePlayerInput,
  boundaryAnchors = {},
}) {
  const sceneNpcs = getSceneNpcs(sceneName);
  const activeSprites = sceneNpcs
    .map((npc) => addNpcSprite(npc, boundaryAnchors))
    .filter(Boolean);
  let activeNpc = null;
  let dismissedNpcId = null;

  chatPanel.hide();

  chatPanel.onClose = () => {
    if (activeNpc) {
      dismissedNpcId = activeNpc.id;
    }

    activeNpc = null;
    player.isInDialogue = false;
    pausePlayerInput(player);
    chatPanel.hide();
  };

  chatPanel.onSubmit = async (userMessage) => {
    if (!activeNpc) {
      return;
    }

    const npc = activeNpc;
    const userTurn = { speaker: "user", text: userMessage, guardrailVerdict: "allow" };
    chatPanel.appendTurn(userTurn, npc.name);
    conversationStateStore.appendTurn(npc.id, userTurn);
    chatPanel.resetInput();
    chatPanel.setBusy(true);
    chatPanel.setStatus("...");
    chatPanel.showTyping(npc.name);

    try {
      const result = await conversationOrchestrator.sendMessage({
        npc,
        sceneId: sceneName,
        userMessage,
        nearbyObjects: buildNearbyObjects(sceneName, npc.id),
      });

      const assistantTurn = {
        speaker: "assistant",
        text: result.responseText,
        guardrailVerdict: result.guardrailVerdict ?? "allow",
      };
      chatPanel.clearTyping();
      chatPanel.appendTurn(assistantTurn, npc.name);
      conversationStateStore.appendTurn(npc.id, assistantTurn);
      chatPanel.setBusy(false);

      if (result.closeChat) {
        chatPanel.setStatus("The words settle. Press Esc or the close button to leave.");
        return;
      }

      chatPanel.setStatus("Speak plainly. Keep to this world and its age.");
    } catch {
      const fallbackTurn = {
        speaker: "assistant",
        text: npc.fallbackReply,
        guardrailVerdict: "fallback",
      };
      chatPanel.clearTyping();
      chatPanel.appendTurn(fallbackTurn, npc.name);
      conversationStateStore.appendTurn(npc.id, fallbackTurn);
      chatPanel.setBusy(false);
      chatPanel.setStatus("The hearth has settled again.");
    }
  };

  function openConversation(npc) {
    if (activeNpc?.id === npc.id) {
      return;
    }

    seedGreeting(npc);
    activeNpc = npc;
    pausePlayerInput(player);
    player.isInDialogue = true;
    chatPanel.showNpc(npc, conversationStateStore.getTurns(npc.id));
    chatPanel.setStatus("The local spirits are gathering...");

    conversationOrchestrator.ensureReady()
      .then(() => {
        if (activeNpc?.id === npc.id) {
          chatPanel.setStatus("Speak plainly. Keep to this world and its age.");
        }
      })
      .catch(() => {
        if (activeNpc?.id === npc.id) {
          chatPanel.setStatus("The local model did not answer. Scripted replies will stand in.");
        }
      });
  }

  function onNpcTouched(npc) {
    if (!npc) {
      return;
    }

    if (dismissedNpcId === npc.id || activeNpc?.id === npc.id) {
      return;
    }

    if (!activeNpc) {
      openConversation(npc);
    }
  }

  function onNpcUntouched(npc) {
    if (!npc) {
      return;
    }

    if (dismissedNpcId === npc.id) {
      dismissedNpcId = null;
    }

    if (activeNpc?.id === npc.id) {
      activeNpc = null;
      player.isInDialogue = false;
      pausePlayerInput(player);
      chatPanel.hide();
    }
  }

  player.onCollide("talkable-npc", (npcSprite) => {
    onNpcTouched(npcSprite.npcDefinition);
  });

  player.onCollideEnd("talkable-npc", (npcSprite) => {
    onNpcUntouched(npcSprite.npcDefinition);
  });

  for (const npc of sceneNpcs) {
    if (!npc.triggerBoundary) {
      continue;
    }

    player.onCollide(npc.triggerBoundary, () => {
      onNpcTouched(npc);
    });

    player.onCollideEnd(npc.triggerBoundary, () => {
      onNpcUntouched(npc);
    });
  }

  return {
    npcs: sceneNpcs,
    activeSprites,
  };
}
