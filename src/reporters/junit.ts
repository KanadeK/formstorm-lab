import type { BrowserScanReport, ScanFinding } from "../adapters/types.js";
import { redactReportValue } from "./redact.js";

function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function testCase(finding: ScanFinding): string {
  const detail = JSON.stringify(finding.evidence ?? {});
  return `<testcase classname="formstorm.${escapeXml(finding.kind)}" name="${escapeXml(finding.id)}"><failure type="${escapeXml(finding.kind)}" message="${escapeXml(finding.message)}">${escapeXml(detail)}</failure></testcase>`;
}

export function renderJunitReport(report: BrowserScanReport): string {
  const safe = redactReportValue(report) as BrowserScanReport;
  const cases =
    safe.findings.length === 0
      ? '<testcase classname="formstorm.scan" name="no-findings"/>'
      : safe.findings.map(testCase).join("");
  const tests = Math.max(1, safe.findings.length);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="FormStorm" tests="${String(tests)}" failures="${String(safe.findings.length)}" errors="0">${cases}</testsuite>\n`;
}
