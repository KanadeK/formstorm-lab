import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { capture } from "./lib/command.mjs";

const root = resolve(process.cwd());
const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".png",
  ".tgz",
  ".webm",
  ".zip",
]);
const patterns = [
  ["private key", /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u],
  ["GitHub token", /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{36,}\b/u],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{60,}\b/u],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/u],
  ["Slack token", /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{20,}\b/u],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{32,}\b/u],
];

const tracked = capture("git", ["ls-files", "-z"], { cwd: root }).split("\0").filter(Boolean);
const findings = [];

for (const relativePath of tracked) {
  if (binaryExtensions.has(extname(relativePath).toLowerCase())) {
    continue;
  }

  const absolutePath = resolve(root, relativePath);
  const buffer = await readFile(absolutePath);
  if (buffer.includes(0)) {
    continue;
  }

  const lines = buffer.toString("utf8").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const [label, pattern] of patterns) {
      if (pattern.test(line)) {
        findings.push(`${relativePath}:${String(index + 1)} ${label}`);
      }
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`Potential secrets found:\n${findings.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Secret scan passed for ${String(tracked.length)} tracked files.\n`);
