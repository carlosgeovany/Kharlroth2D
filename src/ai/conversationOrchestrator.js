async function parseJson(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return text ? JSON.parse(text) : {};
}

export class ConversationOrchestrator {
  constructor() {
    this.readyPromise = null;
    this.selectedModels = null;
  }

  async ensureReady() {
    if (this.selectedModels) {
      return this.selectedModels;
    }

    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = fetch("/api/ai/ready", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(parseJson)
      .then((data) => {
        this.selectedModels = data.selected_models ?? data.selectedModels ?? null;
        return this.selectedModels;
      });

    return this.readyPromise;
  }

  async sendMessage({ npc, sceneId, userMessage, nearbyObjects = [], questFlags = [] }) {
    await this.ensureReady();

    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        npcId: npc.id,
        sceneId,
        userMessage,
        nearbyObjects,
        questFlags,
      }),
    });

    return parseJson(response);
  }
}

export const conversationOrchestrator = new ConversationOrchestrator();
