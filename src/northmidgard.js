import { registerMapScene } from "./mapScene";

export function registerNorthMidgardScene() {
  registerMapScene({
    sceneName: "northmidgard",
    mapSprite: "northmidgard-map",
    mapJson: "./northmidgard.json",
    customSpawns: {
      "from-midgard": { x: 1100, y: 540 },
      "from-nidavellir": { x: 854, y: 324 },
    },
    boundaryActions: {
      Midgard: {
        type: "scene",
        targetScene: "midgard",
        spawnId: "from-northmidgard",
      },
      nidavellir: {
        type: "scene",
        targetScene: "nidavellir",
        spawnId: "from-northmidgard",
      },
    },
    extraBoundaries: [
      {
        name: "Midgard",
        x: 1188,
        y: 592,
        width: 64,
        height: 28,
      },
      {
        name: "nidavellir",
        x: 40,
        y: 250,
        width: 90,
        height: 80,
      },
    ],
  });
}
