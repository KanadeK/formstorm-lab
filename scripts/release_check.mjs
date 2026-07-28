import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { capture, run, runNpm } from "./lib/command.mjs";

const root = resolve(process.cwd());
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
const readme = await readFile(join(root, "README.md"), "utf8");
const versionSource = await readFile(join(root, "src", "core", "version.ts"), "utf8");
const releaseDirectory = join(root, "dist-release");

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

requireCondition(
  capture("git", ["status", "--porcelain"], { cwd: root }) === "",
  "Worktree is not clean.",
);
requireCondition(
  packageLock.version === packageJson.version &&
    packageLock.packages?.[""]?.version === packageJson.version,
  "package.json and package-lock.json versions differ.",
);
requireCondition(
  versionSource.includes(`VERSION = "${packageJson.version}"`),
  "Core version differs from package.json.",
);
requireCondition(
  changelog.includes(`## [${packageJson.version}]`),
  "CHANGELOG does not contain the release version.",
);
requireCondition(
  readme.includes(`v${packageJson.version}`),
  "README does not state the release version.",
);

await runNpm(["run", "verify"], { cwd: root });
await run(process.execPath, ["scripts/scan_secrets.mjs"], { cwd: root });

const tracked = capture("git", ["ls-files", "-z"], { cwd: root }).split("\0").filter(Boolean);
const unfinishedPattern =
  /\b(?:TODO|FIXME|NotImplemented|coming soon|lorem ipsum|placeholder (?:implementation|content|data|result|screen))\b/iu;
const unfinished = [];
for (const relativePath of tracked) {
  if (relativePath === "docs/ROADMAP.md" || relativePath === "scripts/release_check.mjs") {
    continue;
  }
  const bytes = await readFile(join(root, relativePath));
  if (!bytes.includes(0) && unfinishedPattern.test(bytes.toString("utf8"))) {
    unfinished.push(relativePath);
  }
}
requireCondition(unfinished.length === 0, `Unfinished markers found: ${unfinished.join(", ")}`);

const expectedName = capture("git", ["config", "--local", "--get", "user.name"], { cwd: root });
const expectedEmail = capture("git", ["config", "--local", "--get", "user.email"], { cwd: root });
if (!process.env.CI) {
  const githubLogin = capture("gh", ["api", "user", "--jq", ".login"], { cwd: root });
  const githubId = capture("gh", ["api", "user", "--jq", ".id"], { cwd: root });
  requireCondition(
    expectedName === githubLogin,
    `Git author ${expectedName} differs from authenticated GitHub account ${githubLogin}.`,
  );
  requireCondition(
    expectedEmail === `${githubId}+${githubLogin}@users.noreply.github.com`,
    "Git email differs from the authenticated GitHub noreply identity.",
  );
}
const identities = capture("git", ["log", "--format=%an <%ae>|%cn <%ce>|%s"], { cwd: root })
  .split(/\r?\n/u)
  .filter(Boolean);
const commitBodies = capture("git", ["log", "--format=%B%x00"], { cwd: root });
requireCondition(!/^Co-authored-by:/imu.test(commitBodies), "Co-authored-by trailer found.");
for (const identity of identities) {
  const [author, committer, subject] = identity.split("|");
  requireCondition(
    author === `${expectedName} <${expectedEmail}>` &&
      committer === `${expectedName} <${expectedEmail}>`,
    `Unexpected commit identity on ${subject ?? "unknown commit"}.`,
  );
}

const checksumFile = await readFile(join(releaseDirectory, "SHA256SUMS.txt"), "utf8");
const checksumEntries = checksumFile.trim().split(/\r?\n/u).filter(Boolean);
const assets = (await readdir(releaseDirectory)).filter((name) => name !== "SHA256SUMS.txt");
requireCondition(
  checksumEntries.length === assets.length,
  "Release checksum count differs from assets.",
);
for (const entry of checksumEntries) {
  const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(entry);
  requireCondition(match !== null, `Invalid checksum line: ${entry}`);
  const [, expectedHash, assetName] = match;
  const bytes = await readFile(join(releaseDirectory, assetName));
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  requireCondition(actualHash === expectedHash, `Checksum mismatch for ${assetName}.`);
}

process.stdout.write(
  `Release check passed for v${packageJson.version}: ${String(identities.length)} commits, ${String(assets.length)} assets.\n`,
);
