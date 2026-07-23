import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: false,
    outDir: "dist/web",
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
    port: 43117,
    strictPort: true,
  },
});
