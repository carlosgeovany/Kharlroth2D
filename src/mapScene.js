import { createSceneConversationRuntime } from "./ai/sceneConversationRuntime";
import { dialogueData, scaleFactor } from "./constants";
import { ensureBackgroundMusic } from "./assets";
import { k } from "./kaboomCtx";
import { chatPanel } from "./ui/chatPanel";
import { displayDialogue, setCamScale } from "./utils";

const DIRECTION_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]);

function createPlayer() {
  return k.make([
    k.sprite("spritesheet", { anim: "idle-down" }),
    k.area({
      shape: new k.Rect(k.vec2(0, 3), 10, 10),
    }),
    k.body(),
    k.anchor("center"),
    k.pos(),
    k.scale(scaleFactor),
    {
      speed: 250,
      direction: "down",
      isInDialogue: false,
      isTransitioning: false,
      ignoreInputUntil: 0,
    },
    "player",
  ]);
}

function setPlayerSpawn(player, spawnPoint) {
  player.pos = k.vec2(spawnPoint.x * scaleFactor, spawnPoint.y * scaleFactor);
}

function addSceneActor(actor) {
  const startX = actor.x * scaleFactor;
  const startY = actor.y * scaleFactor;
  const patrolRange = (actor.patrolRange ?? 0) * scaleFactor;
  const patrolSpeed = actor.patrolSpeed ?? 1;
  let previousX = startX;

  return k.add([
    k.sprite(actor.sprite, {
      anim: actor.anim,
      frame: actor.frame,
    }),
    k.anchor("center"),
    k.pos(startX, startY),
    k.scale(scaleFactor),
    {
      update() {
        if (!patrolRange) {
          return;
        }

        const nextX = startX + Math.sin(k.time() * patrolSpeed) * patrolRange;
        this.flipX = nextX < previousX;
        this.pos.x = nextX;
        previousX = nextX;

        if (actor.anim && this.curAnim() !== actor.anim) {
          this.play(actor.anim);
        }
      },
    },
    "scene-actor",
  ]);
}

function playIdleAnimation(player) {
  if (player.direction === "down") {
    player.play("idle-down");
    return;
  }

  if (player.direction === "up") {
    player.play("idle-up");
    return;
  }

  player.play("idle-side");
}

function pausePlayerInput(player) {
  player.ignoreInputUntil = performance.now() + 140;
  player.moveTo(player.pos);
  playIdleAnimation(player);
}

function resolveBoundaryRect(boundary) {
  if (Array.isArray(boundary.polygon) && boundary.polygon.length > 0) {
    const xs = boundary.polygon.map((point) => point.x);
    const ys = boundary.polygon.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: boundary.x + minX,
      y: boundary.y + minY,
      width: Math.max(8, maxX - minX),
      height: Math.max(8, maxY - minY),
    };
  }

  if (Array.isArray(boundary.polyline) && boundary.polyline.length > 0) {
    const xs = boundary.polyline.map((point) => point.x);
    const ys = boundary.polyline.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: boundary.x + minX,
      y: boundary.y + minY,
      width: Math.max(8, maxX - minX),
      height: Math.max(8, maxY - minY),
    };
  }

  return {
    x: boundary.x,
    y: boundary.y,
    width: boundary.width,
    height: boundary.height,
  };
}

export function registerMapScene({
  sceneName,
  mapSprite,
  mapJson,
  customSpawns = {},
  boundaryActions = {},
  extraBoundaries = [],
  sceneActors = [],
}) {
  k.scene(sceneName, async ({ spawnId = "default" } = {}) => {
    ensureBackgroundMusic();
    const mapData = await (await fetch(mapJson)).json();
    const layers = mapData.layers;
    const heldDirections = new Set();
    const keyboardAbortController = new AbortController();
    const boundaryAnchors = {};

    const map = k.add([k.sprite(mapSprite), k.pos(0), k.scale(scaleFactor)]);
    const player = createPlayer();
    let defaultSpawnPoint = null;

    function clearMovementState() {
      heldDirections.clear();
      pausePlayerInput(player);
    }

    for (const layer of layers) {
      if (layer.name === "boundaries") {
        for (const boundary of [...layer.objects, ...extraBoundaries]) {
          const boundaryName = boundary.name?.trim();
          const rect = resolveBoundaryRect(boundary);

          map.add([
            k.area({
              shape: new k.Rect(k.vec2(0), rect.width, rect.height),
            }),
            k.body({ isStatic: true }),
            k.pos(rect.x, rect.y),
            boundaryName,
          ]);

          if (boundaryName) {
            boundaryAnchors[boundaryName] = rect;
          }

          if (!boundaryName) {
            continue;
          }

          const action = boundaryActions[boundaryName];

          if (action?.type === "scene") {
            player.onCollide(boundaryName, () => {
              if (player.isInDialogue || player.isTransitioning) {
                return;
              }

              clearMovementState();
              player.isTransitioning = true;
              k.go(action.targetScene, {
                spawnId: action.spawnId ?? "default",
              });
            });
            continue;
          }

          const dialogueText = action?.dialogue ?? dialogueData[boundaryName];
          if (!dialogueText) {
            continue;
          }

          player.onCollide(boundaryName, () => {
            if (player.isInDialogue || player.isTransitioning) {
              return;
            }

            player.isInDialogue = true;

            if (action?.sound) {
              k.play(action.sound, { loop: false });
            }

            displayDialogue(dialogueText, () => {
              player.isInDialogue = false;
            });
          });
        }

        continue;
      }

      if (layer.name === "spawnpoints") {
        for (const entity of layer.objects) {
          if (entity.name === "player") {
            defaultSpawnPoint = {
              x: map.pos.x + entity.x,
              y: map.pos.y + entity.y,
            };
          }
        }
      }
    }

    const spawnPoint = customSpawns[spawnId] ?? defaultSpawnPoint;
    if (!spawnPoint) {
      throw new Error(`Missing spawn point '${spawnId}' for scene '${sceneName}'.`);
    }

    setPlayerSpawn(player, spawnPoint);
    for (const actor of sceneActors) {
      addSceneActor(actor);
    }
    k.add(player);
    createSceneConversationRuntime({
      sceneName,
      player,
      pausePlayerInput: clearMovementState,
      boundaryAnchors,
    });

    addEventListener("keydown", (event) => {
      if (!DIRECTION_KEYS.has(event.key)) {
        return;
      }

      if (chatPanel.isOpen() || player.isTransitioning || player.isInDialogue) {
        heldDirections.delete(event.key);
        return;
      }

      heldDirections.add(event.key);
    }, { signal: keyboardAbortController.signal });

    addEventListener("keyup", (event) => {
      if (!DIRECTION_KEYS.has(event.key)) {
        return;
      }

      heldDirections.delete(event.key);
    }, { signal: keyboardAbortController.signal });

    addEventListener("blur", () => {
      clearMovementState();
    }, { signal: keyboardAbortController.signal });

    k.onSceneLeave(() => {
      keyboardAbortController.abort();
      heldDirections.clear();
    });

    setCamScale(k);

    k.onResize(() => {
      setCamScale(k);
    });

    k.onUpdate(() => {
      k.camPos(player.worldPos().x, player.worldPos().y - 100);
    });

    k.onMouseDown((mouseBtn) => {
      if (mouseBtn !== "left" || player.isInDialogue || player.isTransitioning) {
        return;
      }

      if (performance.now() < player.ignoreInputUntil) {
        return;
      }

      const worldMousePos = k.toWorld(k.mousePos());
      player.moveTo(worldMousePos, player.speed);

      const mouseAngle = player.pos.angle(worldMousePos);
      const lowerBound = 50;
      const upperBound = 125;

      if (
        mouseAngle > lowerBound
        && mouseAngle < upperBound
        && player.curAnim() !== "walk-up"
      ) {
        player.play("walk-up");
        player.direction = "up";
        return;
      }

      if (
        mouseAngle < -lowerBound
        && mouseAngle > -upperBound
        && player.curAnim() !== "walk-down"
      ) {
        player.play("walk-down");
        player.direction = "down";
        return;
      }

      if (Math.abs(mouseAngle) > upperBound) {
        player.flipX = false;
        if (player.curAnim() !== "walk-side") {
          player.play("walk-side");
        }
        player.direction = "right";
        return;
      }

      if (Math.abs(mouseAngle) < lowerBound) {
        player.flipX = true;
        if (player.curAnim() !== "walk-side") {
          player.play("walk-side");
        }
        player.direction = "left";
      }
    });

    k.onMouseRelease(() => {
      playIdleAnimation(player);
    });

    k.onKeyRelease(() => {
      playIdleAnimation(player);
    });

    k.onKeyPress("escape", () => {
      if (chatPanel.isOpen()) {
        chatPanel.requestClose();
        return;
      }

      if (player.isTransitioning) {
        return;
      }

      clearMovementState();
      player.isTransitioning = true;
      k.go("welcome");
    });

    k.onUpdate(() => {
      if (performance.now() < player.ignoreInputUntil) {
        return;
      }

      if (player.isInDialogue || player.isTransitioning || heldDirections.size !== 1) {
        return;
      }

      if (heldDirections.has("ArrowRight")) {
        player.flipX = false;
        if (player.curAnim() !== "walk-side") {
          player.play("walk-side");
        }
        player.direction = "right";
        player.move(player.speed, 0);
        return;
      }

      if (heldDirections.has("ArrowLeft")) {
        player.flipX = true;
        if (player.curAnim() !== "walk-side") {
          player.play("walk-side");
        }
        player.direction = "left";
        player.move(-player.speed, 0);
        return;
      }

      if (heldDirections.has("ArrowUp")) {
        if (player.curAnim() !== "walk-up") {
          player.play("walk-up");
        }
        player.direction = "up";
        player.move(0, -player.speed);
        return;
      }

      if (heldDirections.has("ArrowDown")) {
        if (player.curAnim() !== "walk-down") {
          player.play("walk-down");
        }
        player.direction = "down";
        player.move(0, player.speed);
      }
    });
  });
}
