function createMessageHtml(speaker, text) {
  const wrapper = document.createElement("div");
  const normalizedSpeaker = speaker === "user" ? "You" : speaker;
  const safeSpeakerClass = speaker === "user"
    ? "chat-message-user"
    : speaker === "system"
      ? "chat-message-system"
      : "chat-message-npc";

  wrapper.className = `chat-message ${safeSpeakerClass}`;

  const title = document.createElement("strong");
  title.textContent = normalizedSpeaker;
  wrapper.appendChild(title);

  const content = document.createElement("p");
  content.className = "ui-text";
  content.textContent = text;
  wrapper.appendChild(content);

  return wrapper;
}

function createTypingMessageHtml(npcName) {
  const wrapper = createMessageHtml(npcName, "...");
  wrapper.classList.add("chat-message-typing");
  return wrapper;
}

class ChatPanel {
  constructor() {
    this.container = document.getElementById("chatbox-container");
    this.nameEl = document.getElementById("chat-npc-name");
    this.statusEl = document.getElementById("chat-npc-status");
    this.transcriptEl = document.getElementById("chat-transcript");
    this.formEl = document.getElementById("chat-form");
    this.inputEl = document.getElementById("chat-input");
    this.closeEl = document.getElementById("chat-close");
    this.sendEl = document.getElementById("chat-send");
    this.typingEl = null;
    this.currentNpc = null;
    this.onSubmit = null;
    this.onClose = null;
    this.boundEscHandler = (event) => {
      if (event.key === "Escape" && this.isOpen()) {
        event.preventDefault();
        this.requestClose();
      }
    };

    this.formEl.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!this.onSubmit) {
        return;
      }

      const text = this.inputEl.value.trim();
      if (!text) {
        return;
      }

      this.onSubmit(text);
    });

    this.closeEl.addEventListener("click", () => {
      this.requestClose();
    });

    addEventListener("keydown", this.boundEscHandler);
  }

  showNpc(npc, turns) {
    this.currentNpc = npc;
    this.container.style.display = "block";
    this.nameEl.textContent = npc.name;
    this.statusEl.textContent = "The hearth is quiet. Ask your question.";
    this.inputEl.value = "";
    this.inputEl.placeholder = `Ask ${npc.name} something of this place...`;
    this.renderTurns(turns, npc.name);
    this.setBusy(false);
    queueMicrotask(() => this.inputEl.focus());
  }

  hide() {
    this.currentNpc = null;
    this.container.style.display = "none";
    this.transcriptEl.innerHTML = "";
    this.inputEl.value = "";
    this.typingEl = null;
    this.setBusy(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  renderTurns(turns, npcName) {
    this.transcriptEl.innerHTML = "";
    for (const turn of turns) {
      const speaker = turn.speaker === "assistant" ? npcName : turn.speaker;
      this.transcriptEl.appendChild(createMessageHtml(speaker, turn.text));
    }
    this.scrollTranscriptToBottom();
  }

  appendTurn(turn, npcName) {
    this.clearTyping();
    const speaker = turn.speaker === "assistant" ? npcName : turn.speaker;
    this.transcriptEl.appendChild(createMessageHtml(speaker, turn.text));
    this.scrollTranscriptToBottom();
  }

  showTyping(npcName) {
    this.clearTyping();
    this.typingEl = createTypingMessageHtml(npcName);
    this.transcriptEl.appendChild(this.typingEl);
    this.scrollTranscriptToBottom();
  }

  clearTyping() {
    if (this.typingEl) {
      this.typingEl.remove();
      this.typingEl = null;
    }
  }

  setStatus(text) {
    this.statusEl.textContent = text;
  }

  setBusy(isBusy) {
    this.inputEl.disabled = isBusy;
    this.sendEl.disabled = isBusy;
    this.sendEl.textContent = isBusy ? "..." : "Send";
  }

  resetInput() {
    this.inputEl.value = "";
  }

  scrollTranscriptToBottom() {
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  }

  isOpen() {
    return this.container.style.display !== "none";
  }

  requestClose() {
    if (this.onClose) {
      this.onClose();
    }
  }
}

export const chatPanel = new ChatPanel();
