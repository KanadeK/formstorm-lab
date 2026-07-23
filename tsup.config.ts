import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    cli: "src/commands/cli.ts",
    index: "src/core/index.ts",
  },
  format: ["esm"],
  minify: false,
  outDir: "dist/node",
  platform: "node",
  sourcemap: true,
  target: "node22",
});
