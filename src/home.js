import { registerMapScene } from "./mapScene";

export function registerHomeScene() {
  registerMapScene({
    sceneName: "home",
    mapSprite: "home-map",
    mapJson: "./home.json",
    customSpawns: {
      "from-midgard": { x: 287, y: 182 },
    },
    boundaryActions: {
      exit: {
        type: "scene",
        targetScene: "midgard",
        spawnId: "from-home",
      },
      lisa: {
        sound: "dogBark",
      },
    },
  });
}
