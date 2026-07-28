import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

import AdmZip from "adm-zip";

import { run, runNpm } from "./lib/command.mjs";

const root = await realpath(process.cwd());
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const slug = packageJson.name;
const version = packageJson.version;
const releaseDirectory = resolve(root, "dist-release");

if (
  releaseDirectory !== join(root, "dist-release") ||
  !releaseDirectory.startsWith(`${root}${sep}`)
) {
  throw new Error("Refusing to prepare a release outside the repository.");
}

await rm(releaseDirectory, { force: true, recursive: true });
await mkdir(releaseDirectory, { recursive: true });

await runNpm(["run", "demo"], { cwd: root });
await runNpm(["run", "test:e2e"], { cwd: root });
await runNpm(["run", "build"], { cwd: root });
await runNpm(["pack", "--pack-destination", releaseDirectory], { cwd: root });

const defaultTarball = join(releaseDirectory, `${slug}-${version}.tgz`);
const releaseTarball = join(releaseDirectory, `${slug}-${version}-node-any.tgz`);
await rename(defaultTarball, releaseTarball);

function writeArchive(destination, folders, files = []) {
  const archive = new AdmZip();
  for (const [source, archivePath] of folders) {
    archive.addLocalFolder(source, archivePath);
  }
  for (const [source, archivePath] of files) {
    archive.addLocalFile(source, archivePath);
  }
  archive.writeZip(destination);
}

writeArchive(
  join(releaseDirectory, `${slug}-${version}-cli-node-any.zip`),
  [[join(root, "dist", "node"), "dist/node"]],
  [
    [join(root, "package.json"), ""],
    [join(root, "README.md"), ""],
    [join(root, "LICENSE"), ""],
  ],
);

writeArchive(join(releaseDirectory, `${slug}-${version}-fixture-app-any.zip`), [
  [join(root, "fixtures"), "fixtures"],
]);

await access(join(root, "playwright-report"));
await access(join(root, "reports", "demo"));
writeArchive(join(releaseDirectory, `${slug}-${version}-playwright-evidence-any.zip`), [
  [join(root, "playwright-report"), "playwright-report"],
  [join(root, "reports", "demo"), "reports/demo"],
]);

const smokeDirectory = await mkdtemp(join(tmpdir(), "formstorm-package-"));
try {
  const smokeTarball = join(smokeDirectory, basename(releaseTarball));
  await copyFile(releaseTarball, smokeTarball);
  await runNpm(["init", "-y"], { cwd: smokeDirectory, stdio: "ignore" });
  await runNpm(["install", "--ignore-scripts", smokeTarball], { cwd: smokeDirectory });
  await run(
    process.execPath,
    [join(smokeDirectory, "node_modules", slug, "dist", "node", "cli.js"), "--version"],
    { cwd: smokeDirectory },
  );
} finally {
  await rm(smokeDirectory, { force: true, recursive: true });
}

const assetNames = (await readdir(releaseDirectory))
  .filter((name) => name !== "SHA256SUMS.txt")
  .sort((left, right) => left.localeCompare(right));
const checksumLines = [];
for (const assetName of assetNames) {
  const bytes = await readFile(join(releaseDirectory, assetName));
  checksumLines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${assetName}`);
}
await writeFile(join(releaseDirectory, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`, "utf8");

process.stdout.write(
  `Prepared ${String(assetNames.length)} release assets in ${relative(root, releaseDirectory)}.\n`,
);
