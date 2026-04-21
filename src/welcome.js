import { ensureBackgroundMusic } from "./assets";
import { k } from "./kaboomCtx";

function addShadowedText(content, options, position, frontColor, shadowColor = [8, 21, 47]) {
  k.add([
    k.text(content, options),
    k.anchor("center"),
    k.pos(position.x + 2, position.y + 2),
    k.color(...shadowColor),
  ]);

  return k.add([
    k.text(content, options),
    k.anchor("center"),
    k.pos(position.x, position.y),
    k.color(...frontColor),
  ]);
}

export function registerWelcomeScene() {
  k.scene("welcome", () => {
    k.setBackground(k.Color.fromHex("#000E2F"));

    const centerX = k.width() / 2;
    const centerY = k.height() / 2;
    const frameWidth = k.width() * 0.76;
    const frameHeight = k.height() * 0.68;
    const artScale = Math.min((frameWidth - 72) / 1536, (frameHeight - 132) / 1024);
    let started = false;

    for (let index = 0; index < 40; index += 1) {
      k.add([
        k.rect(2, 2),
        k.color(224, 185, 84),
        k.pos(k.rand(16, k.width() - 16), k.rand(16, k.height() - 16)),
        k.opacity(k.rand(0.3, 0.9)),
      ]);
    }

    k.add([
      k.rect(frameWidth, frameHeight),
      k.anchor("center"),
      k.pos(centerX, centerY),
      k.color(11, 31, 72),
      k.outline(4, k.Color.fromHex("#d4a93d")),
    ]);

    k.add([
      k.sprite("splash-background"),
      k.anchor("center"),
      k.pos(centerX, centerY + 8),
      k.scale(artScale),
      k.opacity(0.6),
    ]);

    k.add([
      k.rect(frameWidth - 56, frameHeight - 112),
      k.anchor("center"),
      k.pos(centerX, centerY + 8),
      k.color(0, 14, 47),
      k.opacity(0.35),
    ]);

    addShadowedText(
      "THE CHRONICS OF",
      {
        font: "monogram",
        size: 28,
      },
      { x: centerX, y: centerY - 126 },
      [233, 195, 95],
    );

    addShadowedText(
      "KHARLROTH",
      {
        font: "monogram",
        size: 48,
      },
      { x: centerX, y: centerY - 92 },
      [247, 211, 107],
    );

    addShadowedText(
      "A 2D adventure through home and Midgard",
      {
        font: "monogram",
        size: 20,
        width: 340,
        align: "center",
      },
      { x: centerX, y: centerY + 110 },
      [240, 216, 149],
    );

    const prompt = k.add([
      k.text("Press Enter or Click to Start", {
        font: "monogram",
        size: 24,
      }),
      k.anchor("center"),
      k.pos(centerX, centerY + 146),
      k.color(250, 223, 131),
    ]);

    addShadowedText(
      "The adventure begins in your house",
      {
        font: "monogram",
        size: 18,
      },
      { x: centerX, y: centerY + 176 },
      [216, 194, 138],
    );

    k.loop(0.6, () => {
      prompt.hidden = !prompt.hidden;
    });

    const startGame = () => {
      if (started) {
        return;
      }

      started = true;
      ensureBackgroundMusic();
      k.go("home", { spawnId: "default" });
    };

    k.onKeyPress("enter", startGame);
    k.onClick(startGame);
  });
}
