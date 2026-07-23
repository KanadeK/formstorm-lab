import { existsSync } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BrowserPolicyError,
  assertTargetAllowed,
  loadJsonSchema,
  runBrowserScan,
  startFixtureServer,
  type BrowserScanReport,
  type FixtureServer,
} from "../../src/adapters/index.js";
import {
  renderHtmlReport,
  renderJsonReport,
  renderJunitReport,
} from "../../src/reporters/index.js";
import { createProgram } from "../../src/commands/cli.js";

const fixtureRoot = resolve(process.cwd(), "fixtures");

describe("file and fixture adapters", () => {
  it("loads a real schema and serves fixtures from a dynamic loopback port", async () => {
    const loaded = await loadJsonSchema(resolve(fixtureRoot, "registration/schema.json"));
    expect(loaded.schema.title).toBe("Registration");

    const server = await startFixtureServer({ rootDir: fixtureRoot });
    try {
      expect(new URL(server.origin).port).not.toBe("0");
      const response = await fetch(server.urlFor("/registration/schema.json"));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ title: "Registration" });
      const traversal = await fetch(server.urlFor("/%2e%2e/package.json"));
      expect([400, 404]).toContain(traversal.status);

      const extractRoot = await mkdtemp(join(tmpdir(), "formstorm-extract-page-"));
      try {
        const extractPath = join(extractRoot, "page.json");
        await createProgram().parseAsync([
          "node",
          "formstorm",
          "extract",
          "--target",
          server.urlFor("/registration/index.html"),
          "--allow-origin",
          `${server.origin}/`,
          "--out",
          extractPath,
        ]);
        const extracted = JSON.parse(await readFile(extractPath, "utf8")) as {
          readonly forms: readonly { readonly fields: readonly unknown[] }[];
        };
        expect(extracted.forms[0]?.fields).toHaveLength(3);
      } finally {
        await rm(extractRoot, { force: true, recursive: true });
      }
    } finally {
      await server.close();
    }
  }, 30_000);

  it("rejects malformed JSON with a typed diagnostic", async () => {
    const root = await mkdtemp(join(tmpdir(), "formstorm-invalid-"));
    const path = join(root, "schema.json");
    try {
      await writeFile(path, "{not-json", "utf8");
      await expect(loadJsonSchema(path)).rejects.toMatchObject({
        code: "INVALID_JSON",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a target outside the exact allowlist before launching Chromium", async () => {
    await expect(
      runBrowserScan({
        exactAllowlist: ["http://127.0.0.1:1"],
        outDir: resolve(tmpdir(), "formstorm-should-not-write"),
        schemaPath: resolve(fixtureRoot, "registration/schema.json"),
        seed: 7,
        target: "http://127.0.0.1:2/registration/",
      }),
    ).rejects.toBeInstanceOf(BrowserPolicyError);
  });

  it("rejects credentials and URL suffixes at the policy boundary", () => {
    for (const target of [
      "http://user:pass@example.test/form",
      "http://example.test/form?token=secret",
      "http://example.test/form#fragment",
    ]) {
      expect(() => assertTargetAllowed(target, ["http://example.test/"])).toThrow(
        BrowserPolicyError,
      );
    }
    for (const origin of [
      "http://user:pass@example.test/",
      "http://example.test/path",
      "http://example.test/?token=secret",
    ]) {
      expect(() => assertTargetAllowed("http://example.test/form", [origin])).toThrow(
        BrowserPolicyError,
      );
    }
  });

  it("reports a missing schema through the typed read failure", async () => {
    await expect(loadJsonSchema(resolve(fixtureRoot, "missing.schema.json"))).rejects.toMatchObject(
      { code: "READ_FAILED" },
    );
  });

  it("surfaces an unreachable allowlisted target as a network failure", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "formstorm-network-error-"));
    try {
      await expect(
        runBrowserScan({
          exactAllowlist: ["http://127.0.0.1:65534/"],
          outDir,
          schemaPath: resolve(fixtureRoot, "registration/schema.json"),
          seed: 7,
          target: "http://127.0.0.1:65534/registration/index.html",
        }),
      ).rejects.toThrow(/ERR_CONNECTION_REFUSED|connect|Navigation/u);
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  }, 30_000);
});

describe("reporters", () => {
  const report = {
    allowlist: ["https://example.test"],
    artifacts: [],
    boundaryResults: [],
    browserOutcomes: [],
    findings: [
      {
        evidence: { password: "do-not-print", tokenText: "Bearer abcdefghijklmnop" },
        id: "injected",
        kind: "validation-mismatch",
        message: '<script>alert("x")</script> & "quotes"',
        severity: "error",
      },
    ],
    forms: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
    schemaPath: "schema.json",
    schemaVersion: "1",
    securityEvents: [],
    seed: 1,
    status: "completed-with-findings",
    summary: {
      accessibilityViolations: 0,
      boundaryCases: 0,
      boundaryFailures: 0,
      expectedRejections: 0,
      findings: 1,
      runtimeErrors: 0,
      securityBlocks: 0,
      validationMismatches: 1,
    },
    target: "https://example.test/?q=<unsafe>",
  } satisfies BrowserScanReport;

  it("escapes standalone HTML and JUnit and redacts JSON", () => {
    const html = renderHtmlReport(report);
    const junit = renderJunitReport(report);
    const json = renderJsonReport(report);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(junit).toContain("&lt;script&gt;");
    expect(json).not.toContain("do-not-print");
    expect(json).not.toContain("abcdefghijklmnop");
    expect(json).toContain("[REDACTED]");
  });
});

const chromiumAvailable = existsSync(chromium.executablePath());

describe.skipIf(!chromiumAvailable)("real Chromium fixture scans", () => {
  let server: FixtureServer;
  let outputRoot: string;
  const reports: BrowserScanReport[] = [];

  beforeAll(async () => {
    server = await startFixtureServer({ rootDir: fixtureRoot });
    outputRoot = await mkdtemp(join(tmpdir(), "formstorm-browser-"));
  });

  afterAll(async () => {
    await server.close();
    await rm(outputRoot, { force: true, recursive: true });
  });

  it.each(["registration", "checkout", "multilingual-profile"])(
    "discovers real validation and axe findings in %s",
    async (fixture) => {
      const outDir = join(outputRoot, fixture);
      const report = await runBrowserScan({
        exactAllowlist: [server.origin],
        fixtureId: fixture,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
        outDir,
        schemaPath: resolve(fixtureRoot, fixture, "schema.json"),
        seed: 42,
        target: server.urlFor(`/${fixture}/`),
      });
      reports.push(report);
      expect(report.summary.validationMismatches).toBeGreaterThan(0);
      expect(report.summary.accessibilityViolations).toBeGreaterThan(0);
      expect(report.summary.boundaryCases).toBeGreaterThan(0);
      expect(report.browserOutcomes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actualOutcome: "rejected",
            matchedExpectation: true,
          }),
        ]),
      );
      expect(report.browserOutcomes).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ actualOutcome: "crashed" })]),
      );
      await Promise.all(
        ["scan.png", "trace.zip", "report.json", "report.html", "report.junit.xml"].map((path) =>
          access(join(outDir, path)),
        ),
      );
      const diskReport = JSON.parse(
        await readFile(join(outDir, "report.json"), "utf8"),
      ) as BrowserScanReport;
      expect(diskReport.seed).toBe(42);
      expect(diskReport.schemaPath).toBe("input.schema.json");
      expect(diskReport.target).toBe(`fixture://${fixture}/index.html`);
      expect(JSON.stringify(diskReport)).not.toContain(outputRoot);
      await access(join(outDir, "input.schema.json"));
    },
    90_000,
  );

  afterAll(() => {
    const dimensions = new Set(
      reports.flatMap((report) => report.boundaryResults.map((result) => result.dimension)),
    );
    expect(dimensions).toEqual(
      new Set(["date", "filename", "length", "rtl", "unicode", "whitespace"]),
    );
    const expectedRejections = reports.flatMap((report) =>
      report.boundaryResults.filter((result) => result.classification === "expected-rejection"),
    );
    expect(expectedRejections.length).toBeGreaterThan(0);
    expect(expectedRejections.every((result) => result.observed.kind !== "runtime-crash")).toBe(
      true,
    );
  });
});

describe.skipIf(!chromiumAvailable)("portable fixture replay", () => {
  it("restarts a closed fixture server and replays one exact boundary case", async () => {
    const root = await mkdtemp(join(tmpdir(), "formstorm-replay-"));
    const initialOut = join(root, "initial");
    const replayOut = join(root, "replayed");
    const server = await startFixtureServer({ rootDir: fixtureRoot });
    try {
      await runBrowserScan({
        exactAllowlist: [server.origin],
        fixtureId: "registration",
        outDir: initialOut,
        schemaPath: resolve(fixtureRoot, "registration/schema.json"),
        seed: 4501,
        target: server.urlFor("/registration/index.html"),
      });
    } finally {
      await server.close();
    }

    try {
      await createProgram().parseAsync([
        "node",
        "formstorm",
        "replay",
        "--report",
        join(initialOut, "report.json"),
        "--case-id",
        "username:length:empty",
        "--out",
        replayOut,
      ]);
      const replayed = JSON.parse(
        await readFile(join(replayOut, "report.json"), "utf8"),
      ) as BrowserScanReport;
      expect(replayed.boundaryResults).toHaveLength(1);
      expect(replayed.boundaryResults[0]?.caseId).toBe("username:length:empty");
      expect(replayed.fixtureId).toBe("registration");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 90_000);
});
