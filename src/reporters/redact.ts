const SENSITIVE_KEY = /(?:api[-_]?key|authorization|cookie|credential|pass(?:word)?|secret|token)/i;
const SENSITIVE_VALUE = /(?:bearer\s+[a-z0-9._~+/-]+=*|(?:gh[opsu]_|sk-)[a-z0-9_-]{8,})/gi;

export function redactReportValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) {
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    return value.replace(SENSITIVE_VALUE, "[REDACTED]");
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactReportValue(entry));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactReportValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}
