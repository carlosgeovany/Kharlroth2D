import { ensureBackgroundMusic } from "./assets";
import { k } from "./kaboomCtx";

export function registerWelcomeScene() {
  k.scene("welcome", () => {
    k.setBackground(k.Color.fromHex("#12040a"));

    const centerX = k.width() / 2;
    const centerY = k.height() / 2;
    let started = false;

    for (let index = 0; index < 40; index += 1) {
      k.add([
        k.rect(2, 2),
        k.color(224, 204, 128),
        k.pos(k.rand(16, k.width() - 16), k.rand(16, k.height() - 16)),
        k.opacity(k.rand(0.3, 0.9)),
      ]);
    }

    k.add([
      k.rect(k.width() * 0.76, k.height() * 0.68),
      k.anchor("center"),
      k.pos(centerX, centerY),
      k.color(26, 16, 20),
      k.outline(4, k.Color.fromHex("#d0a350")),
    ]);

    k.add([
      k.text("KHARLROTH", {
        font: "monogram",
        size: 48,
      }),
      k.anchor("center"),
      k.pos(centerX, centerY - 96),
      k.color(245, 235, 210),
    ]);

    k.add([
      k.text("A 2D adventure through home and Midgard", {
        font: "monogram",
        size: 20,
        width: 320,
        align: "center",
      }),
      k.anchor("center"),
      k.pos(centerX, centerY - 28),
      k.color(228, 196, 124),
    ]);

    const prompt = k.add([
      k.text("Press Enter or Click to Start", {
        font: "monogram",
        size: 24,
      }),
      k.anchor("center"),
      k.pos(centerX, centerY + 60),
      k.color(244, 239, 228),
    ]);

    k.add([
      k.text("The adventure begins in your house", {
        font: "monogram",
        size: 18,
      }),
      k.anchor("center"),
      k.pos(centerX, centerY + 102),
      k.color(184, 168, 148),
    ]);

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
