import kaboom from "kaboom";
import { scaleFactor } from "./constants";
import "./styles.css";

export const k = kaboom({
  global: false,
  touchToMouse: true,
  canvas: document.getElementById("game"),
  debug: true, // set to false once ready for production
});
