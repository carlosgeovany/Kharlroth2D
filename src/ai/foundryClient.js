const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_LOAD_TTL = 3600;
const DEFAULT_NODE_BASE_URL = "http://127.0.0.1:52844";

function resolveUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }

  return new URL(path, DEFAULT_NODE_BASE_URL).toString();
}

function withTimeout(promiseFactory, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return promiseFactory(controller.signal)
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

async function readErrorBody(response) {
  try {
    return await response.text();
  } catch {
    return response.statusText;
  }
}

export class FoundryClient {
  constructor({
    modelsPath = "/openai/models",
    loadedModelsPath = "/openai/loadedmodels",
    loadModelPath = "/openai/load",
    chatPath = "/v1/chat/completions",
  } = {}) {
    this.modelsPath = modelsPath;
    this.loadedModelsPath = loadedModelsPath;
    this.loadModelPath = loadModelPath;
    this.chatPath = chatPath;
    this.modelsCache = null;
  }

  async listModels(forceRefresh = false, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!forceRefresh && Array.isArray(this.modelsCache)) {
      return this.modelsCache;
    }

    const response = await withTimeout((signal) => fetch(resolveUrl(this.modelsPath), { signal }), timeoutMs);
    if (!response.ok) {
      throw new Error(`Unable to list Foundry models: ${await readErrorBody(response)}`);
    }

    const models = await response.json();
    this.modelsCache = Array.isArray(models) ? models : [];
    return this.modelsCache;
  }

  async listLoadedModels({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const response = await withTimeout((signal) => fetch(resolveUrl(this.loadedModelsPath), { signal }), timeoutMs);
    if (!response.ok) {
      throw new Error(`Unable to inspect loaded models: ${await readErrorBody(response)}`);
    }

    const models = await response.json();
    return Array.isArray(models) ? models : [];
  }

  async loadModel(modelName, { ttl = DEFAULT_LOAD_TTL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const query = new URLSearchParams({
      ttl: String(ttl),
    });

    const response = await withTimeout((signal) => fetch(
      resolveUrl(`${this.loadModelPath}/${encodeURIComponent(modelName)}?${query.toString()}`),
      {
        method: "GET",
        signal,
      },
    ), timeoutMs);

    if (!response.ok) {
      throw new Error(`Unable to load Foundry model '${modelName}': ${await readErrorBody(response)}`);
    }
  }

  async chatCompletion({
    model,
    messages,
    maxCompletionTokens = 120,
    temperature = 0.4,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }) {
    const payload = {
      model,
      messages,
      max_completion_tokens: maxCompletionTokens,
      temperature,
      stream: false,
    };

    const response = await withTimeout((signal) => fetch(resolveUrl(this.chatPath), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    }), timeoutMs);

    if (!response.ok) {
      throw new Error(`Foundry chat request failed: ${await readErrorBody(response)}`);
    }

    const data = await response.json();
    const firstChoice = data?.choices?.[0] ?? {};
    const rawContent = firstChoice.message?.content ?? firstChoice.delta?.content ?? "";

    return {
      rawContent,
      finishReason: firstChoice.finish_reason ?? null,
      model: data?.model ?? model,
      data,
    };
  }
}

export const foundryClient = new FoundryClient();
