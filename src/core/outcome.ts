import {
  ObservedOutcomeSchema,
  TestExpectationSchema,
  type ObservedOutcome,
  type OutcomeClassification,
  type TestExpectation,
} from "./models.js";

export function classifyOutcome(
  expectedInput: TestExpectation,
  observedInput: ObservedOutcome,
): OutcomeClassification {
  const expected = TestExpectationSchema.parse(expectedInput);
  const observed = ObservedOutcomeSchema.parse(observedInput);

  if (observed.kind === "runtime-crash") {
    return "runtime-crash";
  }
  if (observed.kind === "timeout") {
    return "timeout";
  }
  if (expected === "observe") {
    return "observed";
  }
  if (expected === "reject") {
    return observed.kind === "rejected" ? "expected-rejection" : "unexpected-acceptance";
  }
  return observed.kind === "accepted" ? "passed" : "unexpected-rejection";
}

export function isFailureClassification(classification: OutcomeClassification): boolean {
  return (
    classification === "unexpected-acceptance" ||
    classification === "unexpected-rejection" ||
    classification === "runtime-crash" ||
    classification === "timeout"
  );
}

export function failureSignature(
  classification: OutcomeClassification,
  observedInput: ObservedOutcome,
): string {
  const observed = ObservedOutcomeSchema.parse(observedInput);
  if (observed.kind === "runtime-crash") {
    return `${classification}:${observed.error.name}:${observed.error.message}`;
  }
  if (observed.kind === "timeout") {
    return `${classification}:${String(observed.timeoutMs)}`;
  }
  if (observed.kind === "rejected") {
    return `${classification}:${observed.validationMessages.join("|")}:${observed.message ?? ""}`;
  }
  return `${classification}:${observed.message ?? ""}`;
}
