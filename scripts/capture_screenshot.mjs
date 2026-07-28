import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

import { chromium } from "playwright";

import { runNpm } from "./lib/command.mjs";

const root = resolve(process.cwd());
const webRoot = resolve(root, "dist", "web");
const outputPath = resolve(root, "docs", "assets", "formstorm-lab.png");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(webRoot, decoded === "/" ? "index.html" : `.${decoded}`);
  const relativePath = relative(webRoot, candidate);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.length === 0) {
    return undefined;
  }
  return candidate;
}

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Screenshot server did not expose a TCP port.");
  }
  return address.port;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error === undefined) resolveClose();
      else reject(error);
    });
  });
}

await runNpm(["run", "build:web"], { cwd: root });
await mkdir(resolve(outputPath, ".."), { recursive: true });

const server = createServer((request, response) => {
  void (async () => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const filePath = safePath(url.pathname);
      if (filePath === undefined || !(await stat(filePath)).isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  })();
});

const port = await listen(server);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    colorScheme: "light",
    viewport: { height: 1000, width: 1440 },
  });
  await page.goto(`http://127.0.0.1:${String(port)}/`, {
    waitUntil: "networkidle",
  });
  await page.locator("#schema-status").filter({ hasText: "fields are ready" }).waitFor();
  await page.getByRole("button", { name: "Generate cases" }).click();
  await page.locator("#generation-status").filter({ hasText: "Generated" }).waitFor();
  await page.locator("#report-status").filter({ hasText: "Loaded" }).waitFor();
  await page
    .locator("#constraint-list details")
    .first()
    .evaluate((element) => {
      element.setAttribute("open", "");
    });
  await page.evaluate(() => globalThis.scrollTo({ behavior: "instant", top: 0 }));
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: outputPath,
  });
} finally {
  await browser.close();
  await close(server);
}

process.stdout.write(`Captured ${relative(root, outputPath)} from the built workbench.\n`);
