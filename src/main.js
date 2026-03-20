import { loadSharedAssets } from "./assets";
import { registerHomeScene } from "./home";
import { k } from "./kaboomCtx";
import { registerMidgardScene } from "./midgard";
import { registerWelcomeScene } from "./welcome";

loadSharedAssets();
registerWelcomeScene();
registerHomeScene();
registerMidgardScene();

k.go("welcome");
