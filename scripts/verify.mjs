import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const checks = [
  ["run", "format:check"],
  ["run", "lint"],
  ["run", "typecheck"],
  ["run", "test:coverage"],
  ["run", "test:e2e"],
  ["run", "build"],
  ["run", "scan:secrets"],
];

for (const args of checks) {
  const command = npmExecPath ? process.execPath : npmCommand;
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: npmExecPath ? false : process.platform === "win32",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    if (result.error) {
      process.stderr.write(`${result.error.message}\n`);
    }
    process.stderr.write(`Verification failed: npm ${args.join(" ")}\n`);
    process.exit(result.status ?? 1);
  }
}
