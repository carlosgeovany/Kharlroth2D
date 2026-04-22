import { defineConfig } from "vite";

const foundryProxy = {
  "/v1": {
    target: "http://127.0.0.1:52844",
    changeOrigin: true,
    secure: false,
  },
  "/openai": {
    target: "http://127.0.0.1:52844",
    changeOrigin: true,
    secure: false,
  },
  "/foundry": {
    target: "http://127.0.0.1:52844",
    changeOrigin: true,
    secure: false,
  },
};

export default defineConfig({
  base: "./",
  server: {
    proxy: foundryProxy,
  },
  preview: {
    proxy: foundryProxy,
  },
  build: {
    minify: "terser",
  },
});
