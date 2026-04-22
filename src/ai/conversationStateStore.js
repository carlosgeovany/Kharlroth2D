function createInitialState() {
  return {
    turns: [],
    memorySummary: "",
    metrics: [],
  };
}

export class ConversationStateStore {
  constructor() {
    this.stateByNpc = new Map();
  }

  ensureState(npcId) {
    if (!this.stateByNpc.has(npcId)) {
      this.stateByNpc.set(npcId, createInitialState());
    }

    return this.stateByNpc.get(npcId);
  }

  getTurns(npcId) {
    return [...this.ensureState(npcId).turns];
  }

  appendTurn(npcId, turn) {
    const state = this.ensureState(npcId);
    state.turns.push({
      ...turn,
      timestamp: turn.timestamp ?? Date.now(),
    });

    if (state.turns.length > 12) {
      state.turns.splice(0, state.turns.length - 12);
    }
  }

  setMemorySummary(npcId, summary) {
    this.ensureState(npcId).memorySummary = summary.trim();
  }

  getMemorySummary(npcId) {
    return this.ensureState(npcId).memorySummary;
  }

  appendMetric(npcId, metric) {
    const state = this.ensureState(npcId);
    state.metrics.push(metric);

    if (state.metrics.length > 25) {
      state.metrics.splice(0, state.metrics.length - 25);
    }
  }

  getMetrics(npcId) {
    return [...this.ensureState(npcId).metrics];
  }
}

export const conversationStateStore = new ConversationStateStore();
