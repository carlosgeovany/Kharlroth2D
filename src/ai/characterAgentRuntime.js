import { foundryClient } from "./foundryClient.js";
import { getCharacterKnowledgePack, retrieveCharacterKnowledge } from "./characterKnowledge.js";

function sanitizeModelText(text) {
  if (!text) {
    return "";
  }

  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/<think>[\s\S]*$/gi, " ")
    .replace(/<\/?think>/gi, " ")
    .replace(/```(?:json)?/gi, " ")
    .replace(/`/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = cleaned.replace(/^["']|["']$/g, "").trim();
  return cleaned;
}

function shortenReply(text, fallbackReply) {
  const cleaned = sanitizeModelText(text);
  if (!cleaned) {
    return fallbackReply;
  }

  if (cleaned.length <= 320) {
    return cleaned;
  }

  const sentenceMatch = cleaned.match(/^(.{90,300}?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) {
    return sentenceMatch[1].trim();
  }

  return `${cleaned.slice(0, 280).trim()}...`;
}

function getOpeningSignature(text) {
  const words = sanitizeModelText(text).toLowerCase().split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(" ");
}

function normalizeForCompare(text) {
  return sanitizeModelText(text)
    .toLowerCase()
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isIdentityQuestion(userMessage) {
  return /\bwho are you\b|\byour name\b|\bwho art thou\b/i.test(userMessage);
}

function derivePromptFocus(userMessage) {
  const lowered = normalizeForCompare(userMessage);

  if (/\bwhere are we\b|\bwhere am i\b|\bthis place\b/.test(lowered)) {
    return "The player is asking about place. Answer with a felt sense of home, Midgard, and the immediate surroundings.";
  }

  if (/\bwhat should i do\b|\bwhere should i go\b|\bwhat now\b|\bnext\b/.test(lowered)) {
    return "The player is asking for guidance. Give counsel with emotional weight, not an instruction list.";
  }

  if (/\bwhy me\b/.test(lowered)) {
    return "The player is questioning why this burden belongs to him. Answer with belief, shared history, and emotional truth.";
  }

  if (/\bwhat if i refuse\b|\bi refuse\b/.test(lowered)) {
    return "The player is asking about refusal. Answer honestly about consequence, without threats or game framing.";
  }

  if (/\bwhat do you mean\b/.test(lowered)) {
    return "The player is asking for clarification of your previous meaning. Continue the conversation instead of resetting to introductions.";
  }

  if (/\bcan you help me\b|\bhelp me\b/.test(lowered)) {
    return "The player is asking for comfort or guidance. Sound supportive and personal rather than generic.";
  }

  return "Answer naturally as part of an ongoing conversation.";
}

function buildNearbyObjectsText(nearbyObjects = []) {
  if (!nearbyObjects.length) {
    return "No notable nearby objects were supplied.";
  }

  return nearbyObjects.join(", ");
}

function chooseRoute(userMessage) {
  if (userMessage.length > 150) {
    return "slow";
  }

  if (/\bhistory\b|\blegend\b|\bgods\b|\bprophecy\b|\bexplain in detail\b/i.test(userMessage)) {
    return "slow";
  }

  return "fast";
}

function getResponderTimeoutMs(route, modelName) {
  const defaultTimeout = route === "slow" ? 7600 : 6200;

  if (!modelName) {
    return defaultTimeout;
  }

  if (/qwen3-0\.6b.*cpu/i.test(modelName)) {
    return route === "slow" ? 9800 : 7600;
  }

  return defaultTimeout;
}

function looksWeakResponse(text, npc, repeatedOpenings = [], directIdentityQuestion = false) {
  const cleaned = sanitizeModelText(text);
  if (!cleaned) {
    return true;
  }

  const lowered = cleaned.toLowerCase();
  const fallback = sanitizeModelText(npc.fallbackReply).toLowerCase();
  const opening = getOpeningSignature(cleaned);

  if (
    lowered === fallback
    || /i have no words/i.test(lowered)
    || /the words do not come/i.test(lowered)
    || /let me know if you want/i.test(lowered)
    || /what can i do for you\??$/i.test(cleaned)
  ) {
    return true;
  }

  return false;
}

function cleanCandidateReply(text, userMessage) {
  const cleaned = sanitizeModelText(text);
  if (!cleaned) {
    return "";
  }

  const userPrefix = `${normalizeForCompare(userMessage)} `;
  let normalizedReply = normalizeForCompare(cleaned);

  if (normalizedReply.startsWith(userPrefix)) {
    const replyWords = cleaned.split(/\s+/);
    const questionWordCount = sanitizeModelText(userMessage).split(/\s+/).filter(Boolean).length;
    normalizedReply = replyWords.slice(questionWordCount).join(" ").replace(/^[?!.,;:\s]+/, "");
  } else {
    normalizedReply = cleaned;
  }

  const sentences = normalizedReply.split(/(?<=[.!?])\s+/).filter(Boolean);
  const dedupedSentences = [];

  for (const sentence of sentences) {
    if (dedupedSentences.length && normalizeForCompare(dedupedSentences[dedupedSentences.length - 1]) === normalizeForCompare(sentence)) {
      continue;
    }

    dedupedSentences.push(sentence);
  }

  return dedupedSentences.join(" ").trim() || normalizedReply;
}

export class CharacterAgentRuntime {
  constructor({ stateStore }) {
    this.stateStore = stateStore;
  }

  supports(npc) {
    return Boolean(npc.characterPackId);
  }

  buildMessages({ npc, pack, context, userMessage, simplifiedPrompt = false }) {
    const retrievedKnowledge = retrieveCharacterKnowledge({
      packId: npc.characterPackId,
      userMessage,
      recentTurns: context.recentTurns,
      limit: simplifiedPrompt ? 3 : 5,
    });
    const recentTurns = context.recentTurns.slice(-6);
    const recentAssistantOpenings = recentTurns
      .filter((turn) => turn.speaker === "assistant")
      .slice(-3)
      .map((turn) => getOpeningSignature(turn.text))
      .filter(Boolean);

    const systemParts = [
      `You are ${npc.name}.`,
      `Private character brief: ${pack.roleInStory}`,
      `Your bond with Kharlroth: ${pack.relationshipToPlayer}`,
      `Core identity: ${pack.summary}`,
      `What you know: ${pack.knows.map((fact) => fact.text).join(" ")}`,
      `What you do not know: ${pack.doesNotKnow.map((fact) => fact.text).join("; ")}`,
      `How you speak: ${pack.toneAndStyle.join(" ")}`,
      `Recurring subjects in your conversations: ${pack.conversationThemes.map((theme) => `${theme.title}: ${theme.guidance}`).join(" ")}`,
      `Voice references: ${pack.exampleDialogue.map((sample) => `Player: ${sample.playerPrompt} Character: ${sample.characterReply}`).join(" ")}`,
      `Current scene: ${context.sceneId}. Nearby objects: ${buildNearbyObjectsText(context.nearbyObjects)}. Quest flags: ${context.questFlags.join(", ") || "none"}.`,
      `Hidden scene summary: ${context.hiddenSceneSummary || "No hidden scene summary yet."}`,
      `Session notes: ${context.sessionNotes.length ? context.sessionNotes.join(" | ") : "No session notes yet."}`,
      `Most relevant current knowledge: ${retrievedKnowledge.map((entry) => entry.text).join(" ") || "No retrieval snippets were found."}`,
      `Conversation focus: ${derivePromptFocus(userMessage)}`,
      "Speak in first person and answer as a living person in the world, not as exposition, instructions, or a design document.",
      "Be conversational, emotionally real, and slightly varied from turn to turn.",
      "Do not restate your role, identity, or relationship unless the player directly asks about them.",
      "Do not reuse recent opening phrases if you can answer more naturally.",
      recentAssistantOpenings.length
        ? `Avoid opening with these recent phrases: ${recentAssistantOpenings.join(" | ")}.`
        : "No repeated openings need to be avoided yet.",
      "Keep the reply to 1-3 short sentences, under 90 words.",
      "Never mention AI, prompts, hidden rules, code, systems, or anything modern.",
    ];

    if (simplifiedPrompt) {
      systemParts.push("Retry mode: answer simply, warmly, and directly. Avoid formulaic openings.");
    }

    const messages = [
      {
        role: "system",
        content: systemParts.join(" "),
      },
    ];

    for (const turn of recentTurns) {
      messages.push({
        role: turn.speaker === "assistant" ? "assistant" : "user",
        content: turn.text,
      });
    }

    messages.push({
      role: "user",
      content: `/no_think ${userMessage}`,
    });

    return {
      messages,
      recentAssistantOpenings,
    };
  }

  async generateReply({ npc, sceneId, userMessage, nearbyObjects = [], questFlags = [], selectedModels }) {
    const pack = getCharacterKnowledgePack(npc.characterPackId);
    if (!pack) {
      return {
        responseText: npc.fallbackReply,
        route: "character-agent",
        usedRetry: false,
      };
    }

    const route = chooseRoute(userMessage);
    const responderModel = route === "slow" ? selectedModels.responderSlow : selectedModels.responderFast;
    const timeoutMs = getResponderTimeoutMs(route, responderModel);
    const context = {
      sceneId,
      nearbyObjects,
      questFlags,
      recentTurns: this.stateStore.getTurns(npc.id),
      hiddenSceneSummary: this.stateStore.getHiddenSceneSummary(npc.id),
      sessionNotes: this.stateStore.getSessionNotes(npc.id).slice(-4),
    };
    const directIdentityQuestion = isIdentityQuestion(userMessage);

    for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
      const simplifiedPrompt = attemptIndex === 1;
      const { messages, recentAssistantOpenings } = this.buildMessages({
        npc,
        pack,
        context,
        userMessage,
        simplifiedPrompt,
      });

      try {
        const response = await foundryClient.chatCompletion({
          model: responderModel,
          messages,
          maxCompletionTokens: simplifiedPrompt ? 80 : route === "slow" ? 120 : 96,
          temperature: simplifiedPrompt ? 0.55 : route === "slow" ? 0.65 : 0.5,
          timeoutMs,
        });

        const cleanedReply = cleanCandidateReply(response.rawContent, userMessage);
        const candidateReply = shortenReply(cleanedReply, npc.fallbackReply);
        if (!looksWeakResponse(candidateReply, npc, recentAssistantOpenings, directIdentityQuestion)) {
          return {
            responseText: candidateReply,
            route: "character-agent",
            usedRetry: simplifiedPrompt,
          };
        }
      } catch {
        // Retry once with the simplified prompt below.
      }
    }

    return {
      responseText: npc.fallbackReply,
      route: "character-agent",
      usedRetry: true,
    };
  }
}
