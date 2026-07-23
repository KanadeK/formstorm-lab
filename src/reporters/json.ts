import { redactReportValue } from "./redact.js";

export function renderJsonReport(report: unknown): string {
  return `${JSON.stringify(redactReportValue(report), null, 2)}\n`;
}
