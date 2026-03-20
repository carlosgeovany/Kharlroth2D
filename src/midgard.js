import { registerMapScene } from "./mapScene";

export function registerMidgardScene() {
  registerMapScene({
    sceneName: "midgard",
    mapSprite: "midgard-map",
    mapJson: "./midgard.json",
    customSpawns: {
      "from-home": { x: 1128, y: 558 },
    },
    boundaryActions: {
      home: {
        type: "scene",
        targetScene: "home",
        spawnId: "from-midgard",
      },
    },
  });
}
