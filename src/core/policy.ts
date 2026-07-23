export class AllowlistPolicyError extends Error {
  public readonly targetOrigin: string;
  public readonly allowedOrigins: readonly string[];

  public constructor(targetOrigin: string, allowedOrigins: readonly string[]) {
    super(
      `Target origin is not allowlisted: ${targetOrigin}. Allowed origins: ${
        allowedOrigins.length === 0 ? "(none)" : allowedOrigins.join(", ")
      }`,
    );
    this.name = "AllowlistPolicyError";
    this.targetOrigin = targetOrigin;
    this.allowedOrigins = allowedOrigins;
  }
}

function parseHttpUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    throw new TypeError(`Invalid target URL: ${String(input)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`Only http and https targets are supported: ${url.protocol}`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError("Target URLs must not contain embedded credentials");
  }
  return url;
}

export function normalizeOrigin(input: string | URL): string {
  return parseHttpUrl(input).origin.toLowerCase();
}

export function isTargetAllowed(
  target: string | URL,
  allowlist: readonly (string | URL)[],
): boolean {
  const targetOrigin = normalizeOrigin(target);
  return allowlist.some((allowed) => normalizeOrigin(allowed) === targetOrigin);
}

export function assertTargetAllowed(
  target: string | URL,
  allowlist: readonly (string | URL)[],
): URL {
  const parsedTarget = parseHttpUrl(target);
  const normalizedAllowed = [
    ...new Set(allowlist.map((allowed) => normalizeOrigin(allowed))),
  ].sort();
  if (!normalizedAllowed.includes(parsedTarget.origin.toLowerCase())) {
    throw new AllowlistPolicyError(
      parsedTarget.origin.toLowerCase(),
      normalizedAllowed,
    );
  }
  return parsedTarget;
}
