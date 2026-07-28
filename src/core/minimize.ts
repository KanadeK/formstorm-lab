import { FormAssignmentsSchema, type FormAssignments } from "./models.js";

export interface FailureProbeResult {
  readonly failed: boolean;
  readonly signature?: string;
}

export type FailureProbe = (
  candidate: FormAssignments,
) => FailureProbeResult | Promise<FailureProbeResult>;

export interface MinimizationOptions {
  readonly maxAttempts?: number;
}

export interface MinimizationResult {
  readonly assignments: FormAssignments;
  readonly signature: string;
  readonly attempts: number;
  readonly acceptedReductions: number;
  readonly truncated: boolean;
}

function stringCandidates(value: string): string[] {
  if (value === "") return [];
  const candidates = new Set<string>(["", value.trim()]);
  for (let parts = 2; parts <= Math.min(value.length, 16); parts *= 2) {
    const chunk = Math.ceil(value.length / parts);
    for (let start = 0; start < value.length; start += chunk) {
      candidates.add(value.slice(0, start) + value.slice(start + chunk));
    }
  }
  candidates.delete(value);
  return [...candidates].sort(
    (left, right) => left.length - right.length || left.localeCompare(right, "en"),
  );
}

function scalarCandidates(value: FormAssignments[string]): FormAssignments[string][] {
  if (typeof value === "string") return stringCandidates(value);
  if (typeof value === "number")
    return [...new Set([0, Math.sign(value), Math.trunc(value)])].filter(
      (entry) => entry !== value,
    );
  if (typeof value === "boolean") return value ? [false] : [];
  if (Array.isArray(value))
    return value.length === 0 ? [] : [[], value.slice(0, Math.floor(value.length / 2))];
  if (value !== null && typeof value === "object")
    return Object.keys(value).length === 0 ? [] : [{}];
  return [];
}

export async function minimizeFailure(
  initialInput: FormAssignments,
  probe: FailureProbe,
  options: MinimizationOptions = {},
): Promise<MinimizationResult> {
  const maxAttempts = options.maxAttempts ?? 64;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10_000) {
    throw new RangeError("maxAttempts must be an integer from 1 through 10000");
  }
  let current = FormAssignmentsSchema.parse(structuredClone(initialInput));
  let attempts = 1;
  let acceptedReductions = 0;
  const initial = await probe(structuredClone(current));
  if (!initial.failed || initial.signature === undefined || initial.signature.length === 0) {
    throw new Error("The initial input must fail with a non-empty signature");
  }
  const signature = initial.signature;

  const tryCandidate = async (candidate: FormAssignments): Promise<boolean> => {
    if (attempts >= maxAttempts) return false;
    attempts += 1;
    const result = await probe(structuredClone(candidate));
    if (result.failed && result.signature === signature) {
      current = candidate;
      acceptedReductions += 1;
      return true;
    }
    return false;
  };

  for (const key of Object.keys(current).sort()) {
    if (attempts >= maxAttempts) break;
    const candidate = Object.fromEntries(
      Object.entries(current).filter(([candidateKey]) => candidateKey !== key),
    );
    await tryCandidate(candidate);
  }

  for (const key of Object.keys(current).sort()) {
    if (attempts >= maxAttempts) break;
    let changed = true;
    while (changed && attempts < maxAttempts && key in current) {
      changed = false;
      const value = current[key];
      if (value === undefined) break;
      for (const replacement of scalarCandidates(value)) {
        if (await tryCandidate({ ...current, [key]: replacement })) {
          changed = true;
          break;
        }
      }
    }
  }

  return {
    assignments: current,
    signature,
    attempts,
    acceptedReductions,
    truncated: attempts >= maxAttempts,
  };
}
