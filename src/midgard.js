import { registerMapScene } from "./mapScene";

export function registerMidgardScene() {
  registerMapScene({
    sceneName: "midgard",
    mapSprite: "midgard-map",
    mapJson: "./midgard.json",
    boundaryActions: {
      home: {
        type: "scene",
        targetScene: "home",
        spawnId: "from-midgard",
      },
    },
  });
}
