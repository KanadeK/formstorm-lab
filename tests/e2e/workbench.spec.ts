import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const workbenchUrl = process.env.FORMSTORM_E2E_URL ?? "/";

test("supports a keyboard-first deterministic generation flow", async ({ page }) => {
  await page.goto(workbenchUrl);
  await expect(page.getByRole("status").filter({ hasText: "fields are ready" })).toBeVisible();

  await page.getByLabel("JSON Schema").focus();
  await page.keyboard.press("Control+Enter");

  const status = page.locator("#generation-status");
  await expect(status).toContainText("Generated");
  await expect(page.locator("#case-list > li")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download cases JSON" })).toBeEnabled();
  await expect(page.locator("#summary-seed")).toHaveText("20260724");
});

test("downloads generated cases as replayable JSON", async ({ page }) => {
  await page.goto(workbenchUrl);
  await page.getByLabel("Committed example").selectOption("checkout");
  await expect(page.locator("#schema-status")).toContainText("fields are ready");
  await page.getByRole("button", { name: "Generate cases" }).click();
  await expect(page.locator("#generation-status")).toContainText("Generated");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download cases JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("formstorm-cases-20260724.json");
  const downloadPath = await download.path();
  const payload = JSON.parse(await readFile(downloadPath, "utf8")) as {
    readonly seed: number;
    readonly cases: readonly unknown[];
  };
  expect(payload.seed).toBe(20260724);
  expect(payload.cases.length).toBeGreaterThan(5);
});

test("keeps controls usable in a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(workbenchUrl);
  await expect(page.getByRole("heading", { name: "Probe every form boundary." })).toBeVisible();

  const controlBox = await page.locator("#generator-form").boundingBox();
  const resultsBox = await page.locator("#results-panel").boundingBox();
  expect(controlBox).not.toBeNull();
  expect(resultsBox).not.toBeNull();
  expect(resultsBox?.y).toBeGreaterThan((controlBox?.y ?? 0) + (controlBox?.height ?? 0) - 2);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Generate cases" })).toBeVisible();
});

test("has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto(workbenchUrl);
  await expect(page.locator("#schema-status")).toContainText("fields are ready");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
