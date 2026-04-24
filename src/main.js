import { loadSharedAssets } from "./assets";
import { conversationOrchestrator } from "./ai/conversationOrchestrator";
import { registerHomeScene } from "./home";
import { k } from "./kaboomCtx";
import { registerMidgardScene } from "./midgard";
import { registerNidavellirScene } from "./nidavellir";
import { registerNorthMidgardScene } from "./northmidgard";
import { registerWelcomeScene } from "./welcome";

loadSharedAssets();
registerWelcomeScene();
registerHomeScene();
registerMidgardScene();
registerNorthMidgardScene();
registerNidavellirScene();

conversationOrchestrator.ensureReady().catch((error) => {
  console.warn("Local AI conversation warmup failed.", error);
});

k.go("welcome");
