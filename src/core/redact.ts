import { JsonValueSchema, type JsonValue } from "./models.js";

export const REDACTED_VALUE = "[REDACTED]" as const;

const SECRET_KEY_PATTERN =
  /(?:^|[_\-.])(?:api[_-]?key|authorization|cookie|credential|pass(?:word)?|passwd|private[_-]?key|secret|session(?:id)?|token)(?:$|[_\-.])/iu;
const COMPACT_SECRET_KEY_PATTERN =
  /^(?:accessToken|apiKey|authToken|clientSecret|passwordHint|refreshToken|secretKey|sessionId)$/iu;
const SECRET_VALUE_PATTERNS = [
  /^Bearer\s+\S+$/iu,
  /^gh[opusr]_[A-Za-z0-9_]{20,}$/u,
  /^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/u,
] as const;

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key) || COMPACT_SECRET_KEY_PATTERN.test(key);
}

function redactValue(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))
      ? REDACTED_VALUE
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        isSecretKey(key) ? REDACTED_VALUE : redactValue(child),
      ]),
    );
  }
  return value;
}

export function redactSecrets(value: JsonValue): JsonValue {
  return redactValue(JsonValueSchema.parse(value));
}
