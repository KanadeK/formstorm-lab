import { spawn, spawnSync } from "node:child_process";

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return [process.execPath, [npmExecPath, ...args]];
  }

  return [process.platform === "win32" ? "npm.cmd" : "npm", args];
}

export async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      shell: false,
      stdio: options.stdio ?? "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${String(code)}`
          }`,
        ),
      );
    });
  });
}

export async function runNpm(args, options = {}) {
  const [command, commandArgs] = npmInvocation(args);
  await run(command, commandArgs, options);
}

export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    env: options.env ?? process.env,
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr || result.error?.message || "unknown error"}`,
    );
  }

  return result.stdout.trim();
}

export function captureNpm(args, options = {}) {
  const [command, commandArgs] = npmInvocation(args);
  return capture(command, commandArgs, options);
}
