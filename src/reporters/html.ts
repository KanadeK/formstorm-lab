import type { BrowserScanReport, ScanFinding } from "../adapters/types.js";
import { redactReportValue } from "./redact.js";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function findingRow(finding: ScanFinding): string {
  const evidence = finding.evidence === undefined ? "" : JSON.stringify(finding.evidence, null, 2);
  return `<tr><td><span class="severity ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span></td><td>${escapeHtml(finding.kind)}</td><td>${escapeHtml(finding.field ?? "—")}</td><td>${escapeHtml(finding.message)}${evidence.length === 0 ? "" : `<details><summary>Evidence</summary><pre>${escapeHtml(evidence)}</pre></details>`}</td></tr>`;
}

export function renderHtmlReport(report: BrowserScanReport): string {
  const safe = redactReportValue(report) as BrowserScanReport;
  const rows =
    safe.findings.length === 0
      ? '<tr><td colspan="4">No findings.</td></tr>'
      : safe.findings.map(findingRow).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FormStorm report</title><style>
:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{max-width:1100px;margin:auto;padding:2rem}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:1rem}.metric{border:1px solid #8886;border-radius:.5rem;padding:1rem}
table{border-collapse:collapse;width:100%;margin-top:2rem}th,td{border-bottom:1px solid #8886;padding:.7rem;text-align:left;vertical-align:top}
.severity{font-weight:700}.error{color:#d33}.warning{color:#c70}pre{white-space:pre-wrap;overflow-wrap:anywhere}
</style></head><body><main><h1>FormStorm scan report</h1>
<p><strong>Target:</strong> ${escapeHtml(safe.target)}</p>
<div class="summary"><div class="metric"><strong>${String(safe.summary.findings)}</strong><br>findings</div><div class="metric"><strong>${String(safe.summary.validationMismatches)}</strong><br>validation mismatches</div><div class="metric"><strong>${String(safe.summary.accessibilityViolations)}</strong><br>accessibility violations</div><div class="metric"><strong>${String(safe.summary.securityBlocks)}</strong><br>blocked requests</div></div>
<table><thead><tr><th>Severity</th><th>Kind</th><th>Field</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table>
</main></body></html>
`;
}
