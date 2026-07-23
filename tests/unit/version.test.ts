import { describe, expect, it } from "vitest";

import { REPORT_SCHEMA_VERSION, VERSION } from "../../src/core/index.js";

describe("version contract", () => {
  it("keeps package and report versions explicit", () => {
    expect(VERSION).toBe("0.1.0");
    expect(REPORT_SCHEMA_VERSION).toBe("1");
  });
});
