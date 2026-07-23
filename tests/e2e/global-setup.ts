import { resolve } from "node:path";
import { build } from "vite";

import { startFixtureServer } from "../../src/adapters/fixture-server.js";

export default async function globalSetup(): Promise<() => Promise<void>> {
  await build({ configFile: resolve("vite.config.ts") });
  const server = await startFixtureServer({
    rootDir: resolve("dist/web"),
  });
  process.env.FORMSTORM_E2E_URL = `${server.origin}/`;
  return async () => {
    await server.close();
  };
}
