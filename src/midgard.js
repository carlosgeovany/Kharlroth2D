import { registerMapScene } from "./mapScene";

export function registerMidgardScene() {
  registerMapScene({
    sceneName: "midgard",
    mapSprite: "midgard-map",
    mapJson: "./midgard.json",
    customSpawns: {
      "from-home": { x: 1128, y: 558 },
      "from-northmidgard": { x: 1120, y: 120 },
    },
    boundaryActions: {
      home: {
        type: "scene",
        targetScene: "home",
        spawnId: "from-midgard",
      },
      NorthMidgard: {
        type: "scene",
        targetScene: "northmidgard",
        spawnId: "from-midgard",
      },
    },
    extraBoundaries: [
      {
        name: "NorthMidgard",
        x: 1168,
        y: 24,
        width: 88,
        height: 28,
      },
    ],
  });
}
