import { loadSharedAssets } from "./assets";
import { conversationOrchestrator } from "./ai/conversationOrchestrator";
import { registerHomeScene } from "./home";
import { k } from "./kaboomCtx";
import { registerMidgardScene } from "./midgard";
import { registerWelcomeScene } from "./welcome";

loadSharedAssets();
registerWelcomeScene();
registerHomeScene();
registerMidgardScene();

conversationOrchestrator.ensureReady().catch((error) => {
  console.warn("Foundry local conversation warmup failed.", error);
});

k.go("welcome");
