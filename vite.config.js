import { defineConfig } from "vite";

const aiProxy = {
  "/api/ai": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
    secure: false,
  },
};

export default defineConfig({
  base: "./",
  server: {
    proxy: aiProxy,
  },
  preview: {
    proxy: aiProxy,
  },
  build: {
    minify: "terser",
  },
});
