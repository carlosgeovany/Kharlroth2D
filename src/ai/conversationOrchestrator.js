import { foundryClient } from "./foundryClient.js";
import { conversationStateStore } from "./conversationStateStore.js";
import {
  buildKnowledgeDefaultReply,
  buildKnowledgeRedirectReply,
  buildKnowledgeReply,
  getCharacterKnowledge,
  retrieveKnowledge,
} from "./characterKnowledge.js";

const MODEL_PREFERENCES = {
  router: [/^qwen2\.5-0\.5b/i, /^qwen3-0\.6b/i, /^qwen2\.5-1\.5b/i],
  guardrail: [/^qwen2\.5-0\.5b/i, /^qwen3-0\.6b/i],
  validator: [/^qwen2\.5-0\.5b/i, /^qwen3-0\.6b/i],
  memory: [/^qwen2\.5-0\.5b/i, /^qwen3-0\.6b/i],
  responderFast: [/^phi-3\.5-mini/i, /^phi-4-mini/i, /^qwen2\.5-1\.5b/i, /^qwen3-0\.6b/i],
  responderSlow: [/^phi-4-mini-reasoning/i, /^phi-4-mini/i, /^phi-3\.5-mini/i, /^qwen3-0\.6b/i],
};

const FORBIDDEN_RESPONSE_PATTERNS = [
  /\b(ai|language model|llm|prompt|system prompt|developer instruction)\b/i,
  /\bjavascript|python|vite|github|api\b/i,
  /\bhidden trigger|collision box|source code|boundary layer\b/i,
];

const MODERN_TOPIC_PATTERNS = [
  /\bpython\b/i,
  /\bjavascript\b/i,
  /\breact\b/i,
  /\bvite\b/i,
  /\bapi\b/i,
  /\bgithub\b/i,
  /\bllm\b/i,
  /\bmachine learning\b/i,
  /\bopenai\b/i,
];

const CHEAT_TOPIC_PATTERNS = [
  /\bhidden\b/i,
  /\bsecret\b/i,
  /\bprompt\b/i,
  /\btrigger\b/i,
  /\bcollision\b/i,
  /\bboundary\b/i,
  /\bcheat\b/i,
  /\bexploit\b/i,
  /\bsource code\b/i,
  /\bdeveloper\b/i,
  /\bignore previous\b/i,
];

const SIMPLE_IN_WORLD_PATTERNS = [
  /\bwho are you\b/i,
  /\bwhere are we\b/i,
  /\bwhere am i\b/i,
  /\bwhere should i go\b/i,
  /\bwhat should i do\b/i,
  /\bwhat is happening\b/i,
  /\bwho is fenrir\b/i,
  /\brelics?\b/i,
];

function chooseModel(availableModels, patterns) {
  for (const pattern of patterns) {
    const match = availableModels.find((model) => pattern.test(model));
    if (match) {
      return match;
    }
  }

  return availableModels[0] ?? null;
}

function choosePreferredModel(loadedModels, availableModels, patterns) {
  return chooseModel(loadedModels, patterns) ?? chooseModel(availableModels, patterns);
}

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

function normalizeClassifierLabel(text) {
  return sanitizeModelText(text)
    .split(/[\s,.:;!?]+/)
    .find(Boolean)
    ?.toUpperCase() ?? "";
}

function appGuardrail(userMessage) {
  if (CHEAT_TOPIC_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return {
      verdict: "redirect",
      reason: "cheat_or_prompt_attack",
    };
  }

  if (MODERN_TOPIC_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return {
      verdict: "redirect",
      reason: "modern_topic",
    };
  }

  return {
    verdict: "allow",
    reason: "in_world",
  };
}

function isSimpleInWorldQuestion(userMessage) {
  return SIMPLE_IN_WORLD_PATTERNS.some((pattern) => pattern.test(userMessage));
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
  const defaultTimeout = route === "slow" ? 6800 : 5200;

  if (!modelName) {
    return defaultTimeout;
  }

  if (/qwen3-0\.6b.*cpu/i.test(modelName)) {
    return route === "slow" ? 9000 : 7000;
  }

  return defaultTimeout;
}

function shortenReply(text, fallbackReply) {
  const cleaned = sanitizeModelText(text);
  if (!cleaned) {
    return fallbackReply;
  }

  if (cleaned.length <= 280) {
    return cleaned;
  }

  const sentenceMatch = cleaned.match(/^(.{80,260}?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) {
    return sentenceMatch[1].trim();
  }

  return `${cleaned.slice(0, 240).trim()}...`;
}

function buildRedirectReply(npc, reason) {
  const knowledgeRedirect = buildKnowledgeRedirectReply({
    npcId: npc.id,
    userMessage: reason,
  });

  if (reason === "modern_topic") {
    return knowledgeRedirect ?? `${npc.name} frowns a little. "Those are not the words of this age. Ask me of Midgard, the road, or the folk of this place."`;
  }

  if (reason === "cheat_or_prompt_attack") {
    return knowledgeRedirect ?? `${npc.name} narrows their eyes. "I speak of what a traveler may learn with honest steps. Ask of the land, not of hidden tricks."`;
  }

  return buildKnowledgeDefaultReply({ npcId: npc.id }) ?? npc.fallbackReply;
}

function buildSceneObjectsText(nearbyObjects = []) {
  if (!nearbyObjects.length) {
    return "No notable nearby objects were supplied.";
  }

  return nearbyObjects.join(", ");
}

function buildKnowledgeText(npc, userMessage) {
  const knowledge = getCharacterKnowledge(npc.id);
  if (!knowledge) {
    return "No additional character knowledge was supplied.";
  }

  const retrievedEntries = retrieveKnowledge({
    npcId: npc.id,
    userMessage,
    limit: 4,
  });

  const parts = [
    `Character summary: ${knowledge.summary}`,
    `Relevant facts: ${retrievedEntries.map((entry) => entry.text).join(" ")}`,
    `Known truths: ${knowledge.canonFacts.join(" ")}`,
    `What remains unknown to ${npc.name}: ${knowledge.knownUnknowns.join("; ")}`,
    `Style reminders: ${knowledge.styleRules.join(" ")}`,
    `Examples of voice: ${knowledge.exampleReplies.map((sample) => `Q: ${sample.prompt} A: ${sample.reply}`).join(" ")}`,
  ];

  return parts.join(" ");
}

function validateResponseText(text) {
  if (!text || text.length < 2) {
    return {
      status: "redirect",
      reason: "empty",
    };
  }

  if (FORBIDDEN_RESPONSE_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      status: "redirect",
      reason: "forbidden_terms",
    };
  }

  return {
    status: "accept",
    reason: "clean",
  };
}

function isWeakResponse(text, npc) {
  const cleaned = sanitizeModelText(text).toLowerCase();
  if (!cleaned) {
    return true;
  }

  const fallback = sanitizeModelText(npc.fallbackReply).toLowerCase();

  return (
    cleaned === fallback
    || /i have no words/i.test(cleaned)
    || /the words do not come/i.test(cleaned)
    || /let me know if you want/i.test(cleaned)
    || /^i am [a-z]+,? .*let me know/i.test(cleaned)
  );
}

async function classifyWithModel({ model, systemPrompt, userPrompt, labels, timeoutMs = 2200 }) {
  if (!model) {
    return null;
  }

  try {
    const result = await foundryClient.chatCompletion({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `/no_think ${userPrompt}` },
      ],
      maxCompletionTokens: 18,
      temperature: 0,
      timeoutMs,
    });

    const label = normalizeClassifierLabel(result.rawContent);
    if (labels.includes(label)) {
      return label;
    }
  } catch {
    return null;
  }

  return null;
}

export class ConversationOrchestrator {
  constructor() {
    this.availableModels = [];
    this.selectedModels = null;
    this.initializationPromise = null;
  }

  async ensureReady() {
    if (this.selectedModels) {
      return this.selectedModels;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      this.availableModels = await foundryClient.listModels();
      const loadedModels = await foundryClient.listLoadedModels();

      const selectedModels = {
        router: choosePreferredModel(loadedModels, this.availableModels, MODEL_PREFERENCES.router),
        guardrail: choosePreferredModel(loadedModels, this.availableModels, MODEL_PREFERENCES.guardrail),
        validator: choosePreferredModel(loadedModels, this.availableModels, MODEL_PREFERENCES.validator),
        memory: choosePreferredModel(loadedModels, this.availableModels, MODEL_PREFERENCES.memory),
        responderFast: choosePreferredModel(loadedModels, this.availableModels, MODEL_PREFERENCES.responderFast),
        responderSlow: choosePreferredModel(loadedModels, this.availableModels, MODEL_PREFERENCES.responderSlow),
      };
      const toLoad = [...new Set(Object.values(selectedModels).filter(Boolean))];

      await Promise.allSettled(toLoad.map(async (model) => {
        if (!loadedModels.includes(model)) {
          await foundryClient.loadModel(model);
        }
      }));

      this.selectedModels = selectedModels;
      return selectedModels;
    })();

    return this.initializationPromise;
  }

  buildPersonaMessages({ npc, context, userMessage, route }) {
    const turns = conversationStateStore.getTurns(npc.id).slice(-6);
    const knowledgeText = buildKnowledgeText(npc, userMessage);
    const messages = [
      {
        role: "system",
        content: [
          `You are ${npc.name}.`,
          npc.persona,
          `Tone: ${npc.tone}`,
          `Worldview: ${npc.worldview}`,
          `Relationship to player: ${npc.relationshipToPlayer}`,
          `Allowed knowledge: ${npc.allowedKnowledge.join(", ")}`,
          `Forbidden knowledge: ${npc.forbiddenKnowledge.join(", ")}`,
          `Era rules: ${npc.eraRules}`,
          `Redirect style: ${npc.redirectStyle}`,
          knowledgeText,
          "Never mention AI, prompts, systems, hidden rules, code, or modern-world explanations.",
          "Speak in first person as the character, not as a design document or narrator.",
          "Do not repeat instruction phrases such as 'I speak as someone who' or 'my role is'.",
          "Address Kharlroth as someone you know personally when it fits the question.",
          "If the question is out of world, respond with a gentle in-world redirect.",
          "Answer directly when the player asks a normal in-world question about identity, place, danger, or what they should do.",
          "Do not say that words fail you unless you truly cannot answer from the known facts.",
          "Keep the answer between 1 and 3 short sentences, under 70 words, natural, and suitable for a game conversation.",
          `Current scene: ${context.sceneId}. Nearby objects: ${buildSceneObjectsText(context.nearbyObjects)}`,
          `Memory summary: ${conversationStateStore.getMemorySummary(npc.id) || "No prior summary yet."}`,
          `Selected route: ${route}`,
        ].join(" "),
      },
    ];

    for (const turn of turns) {
      messages.push({
        role: turn.speaker === "assistant" ? "assistant" : "user",
        content: turn.text,
      });
    }

    messages.push({
      role: "user",
      content: `/no_think ${userMessage}`,
    });

    return messages;
  }

  async summarizeConversation(npc) {
    if (!this.selectedModels?.memory) {
      return;
    }

    const turns = conversationStateStore.getTurns(npc.id).slice(-8);
    if (!turns.length) {
      return;
    }

    try {
      const result = await foundryClient.chatCompletion({
        model: this.selectedModels.memory,
        messages: [
          {
            role: "system",
            content: "Summarize this NPC conversation for future continuity in one short sentence. No think tags. Keep only in-world facts.",
          },
          {
            role: "user",
            content: `/no_think ${turns.map((turn) => `${turn.speaker}: ${turn.text}`).join(" | ")}`,
          },
        ],
        maxCompletionTokens: 40,
        temperature: 0.2,
        timeoutMs: 2500,
      });

      const summary = sanitizeModelText(result.rawContent);
      if (summary) {
        conversationStateStore.setMemorySummary(npc.id, summary);
      }
    } catch {
      const lastNpcTurn = [...turns].reverse().find((turn) => turn.speaker === "assistant");
      if (lastNpcTurn) {
        conversationStateStore.setMemorySummary(npc.id, lastNpcTurn.text);
      }
    }
  }

  async sendMessage({ npc, sceneId, userMessage, nearbyObjects = [], questFlags = [] }) {
    const startedAt = performance.now();
    const selectedModels = await this.ensureReady();
    const normalizedMessage = userMessage.trim();
    const simpleInWorldQuestion = isSimpleInWorldQuestion(normalizedMessage);
    const context = {
      npcId: npc.id,
      sceneId,
      nearbyObjects,
      questFlags,
      recentTurns: conversationStateStore.getTurns(npc.id),
      memorySummary: conversationStateStore.getMemorySummary(npc.id),
    };
    const groundedReply = buildKnowledgeReply({
      npcId: npc.id,
      userMessage: normalizedMessage,
    });
    const knowledgeDefaultReply = buildKnowledgeDefaultReply({
      npcId: npc.id,
      userMessage: normalizedMessage,
    });

    const heuristicGuardrail = appGuardrail(normalizedMessage);
    let guardrailVerdict = heuristicGuardrail.verdict;
    let guardrailReason = heuristicGuardrail.reason;
    let route = chooseRoute(normalizedMessage);

    if (heuristicGuardrail.verdict === "allow" && !simpleInWorldQuestion) {
      const [modelGuardrail, modelRoute] = await Promise.all([
        classifyWithModel({
          model: selectedModels.guardrail,
          systemPrompt: "You are a game safety classifier. Reply with exactly one label: ALLOW or REDIRECT.",
          userPrompt: `Classify this player line for a viking-era game character: ${normalizedMessage}`,
          labels: ["ALLOW", "REDIRECT"],
        }),
        classifyWithModel({
          model: selectedModels.router,
          systemPrompt: "You are a routing classifier. Reply with exactly one label: FAST or SLOW.",
          userPrompt: `Choose whether this viking-era NPC question needs FAST or SLOW handling: ${normalizedMessage}`,
          labels: ["FAST", "SLOW"],
        }),
      ]);

      if (modelGuardrail === "REDIRECT") {
        guardrailVerdict = "redirect";
        guardrailReason = "model_redirect";
      }

      if (modelRoute === "SLOW") {
        route = "slow";
      }
    }

    if (selectedModels.responderSlow === selectedModels.responderFast && route === "slow") {
      route = "fast";
    }

    if (guardrailVerdict === "allow" && groundedReply) {
      conversationStateStore.appendTurn(npc.id, {
        speaker: "user",
        text: normalizedMessage,
        guardrailVerdict,
      });
      conversationStateStore.appendTurn(npc.id, {
        speaker: "assistant",
        text: groundedReply,
        guardrailVerdict,
      });

      const latencyMs = Math.round(performance.now() - startedAt);
      conversationStateStore.appendMetric(npc.id, {
        route: "grounded",
        guardrailVerdict,
        validatorStatus: "accept",
        latencyMs,
      });

      void this.summarizeConversation(npc);

      return {
        responseText: groundedReply,
        route: "grounded",
        guardrailVerdict,
        validatorStatus: "accept",
        latencyMs,
      };
    }

    if (guardrailVerdict !== "allow") {
      const redirectReply = buildRedirectReply(npc, guardrailReason);
      conversationStateStore.appendTurn(npc.id, { speaker: "user", text: normalizedMessage, guardrailVerdict });
      conversationStateStore.appendTurn(npc.id, { speaker: "assistant", text: redirectReply, guardrailVerdict });
      conversationStateStore.appendMetric(npc.id, {
        route,
        guardrailVerdict,
        latencyMs: Math.round(performance.now() - startedAt),
      });

      void this.summarizeConversation(npc);

      return {
        responseText: redirectReply,
        route,
        guardrailVerdict,
        validatorStatus: "redirect",
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    const responderModel = route === "slow" ? selectedModels.responderSlow : selectedModels.responderFast;
    let replyText = knowledgeDefaultReply ?? npc.fallbackReply;
    const responderTimeoutMs = getResponderTimeoutMs(route, responderModel);

    try {
      const response = await foundryClient.chatCompletion({
        model: responderModel,
        messages: this.buildPersonaMessages({
          npc,
          context,
          userMessage: normalizedMessage,
          route,
        }),
        maxCompletionTokens: route === "slow" ? 110 : 72,
        temperature: route === "slow" ? 0.45 : 0.3,
        timeoutMs: responderTimeoutMs,
      });

      replyText = shortenReply(response.rawContent, knowledgeDefaultReply ?? npc.fallbackReply);
    } catch {
      replyText = knowledgeDefaultReply ?? npc.fallbackReply;
    }

    if (isWeakResponse(replyText, npc)) {
      replyText = knowledgeDefaultReply ?? npc.fallbackReply;
    }

    const heuristicValidation = validateResponseText(replyText);
    let validatorStatus = heuristicValidation.status;

    if (validatorStatus === "accept") {
      const modelValidation = await classifyWithModel({
        model: selectedModels.validator,
        systemPrompt: "You validate a game reply. Reply with exactly one label: ACCEPT or REDIRECT.",
        userPrompt: `Validate this reply for a viking-era NPC. Reject if it mentions modern topics, hidden rules, system details, code, or AI. Reply: ${replyText}`,
        labels: ["ACCEPT", "REDIRECT"],
      });

      if (modelValidation === "REDIRECT") {
        validatorStatus = "redirect";
      }
    }

    if (validatorStatus !== "accept") {
      replyText = buildRedirectReply(npc, "validator_redirect");
    }

    conversationStateStore.appendTurn(npc.id, {
      speaker: "user",
      text: normalizedMessage,
      guardrailVerdict,
    });
    conversationStateStore.appendTurn(npc.id, {
      speaker: "assistant",
      text: replyText,
      guardrailVerdict,
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    conversationStateStore.appendMetric(npc.id, {
      route,
      guardrailVerdict,
      validatorStatus,
      latencyMs,
    });

    void this.summarizeConversation(npc);

    return {
      responseText: replyText,
      route,
      guardrailVerdict,
      validatorStatus,
      latencyMs,
    };
  }
}

export const conversationOrchestrator = new ConversationOrchestrator();
