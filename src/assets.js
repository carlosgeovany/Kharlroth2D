import { k } from "./kaboomCtx";

let backgroundMusic = null;

export function loadSharedAssets() {
  k.loadFont("monogram", "./monogram.ttf");

  k.loadSprite("spritesheet", "./archer.png", {
    sliceX: 3,
    sliceY: 4,
    anims: {
      "idle-down": 0,
      "walk-down": { from: 0, to: 2, loop: true, speed: 8 },
      "idle-side": 6,
      "walk-side": { from: 6, to: 8, loop: true, speed: 8 },
      "idle-up": 9,
      "walk-up": { from: 9, to: 11, loop: true, speed: 8 },
    },
  });

  k.loadSprite("home-map", "./home.png");
  k.loadSprite("midgard-map", "./midgard.png");
  k.loadSprite("splash-background", "./splash-background.png");
  k.loadSprite("npc-yrsa", "./femHeroHuman1v2.png", {
    sliceX: 3,
    sliceY: 4,
  });
  k.loadSprite("npc-eirik", "./mascHeroHuman2v2.png", {
    sliceX: 3,
    sliceY: 4,
  });

  k.loadSound("bgMusic", "./adventure.mp3");
  k.loadSound("dogBark", "./dog_bark.mp3");
}

export function ensureBackgroundMusic() {
  if (!backgroundMusic) {
    backgroundMusic = k.play("bgMusic", {
      loop: true,
      volume: 0.6,
    });
  }

  return backgroundMusic;
}
