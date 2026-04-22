import { registerMapScene } from "./mapScene";

export function registerNidavellirScene() {
  registerMapScene({
    sceneName: "nidavellir",
    mapSprite: "nidavellir-map",
    mapJson: "./nidavellir.json",
    customSpawns: {
      "from-northmidgard": { x: 195, y: 10 },
    },
    boundaryActions: {
      exit: {
        type: "scene",
        targetScene: "northmidgard",
        spawnId: "from-nidavellir",
      },
    },
  });
}
