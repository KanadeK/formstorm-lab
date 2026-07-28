import { resolve } from "node:path";

import { run, runNpm } from "./lib/command.mjs";

const root = resolve(process.cwd());

await runNpm(["run", "build"], { cwd: root });
await run(
  process.execPath,
  ["dist/node/cli.js", "demo", "--out", "reports/demo", "--seed", "4501"],
  { cwd: root },
);
