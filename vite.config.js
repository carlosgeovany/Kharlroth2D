import { defineConfig } from "vite";

const foundryProxy = {
  "/api/ai": {
    target: "http://127.0.0.1:8000",
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
