import { describe, expect, it } from "vitest";
import { hasExcessPermissions } from "@/core/policy";

describe("hasExcessPermissions", () => {
  it("allows contents and metadata read", () => {
    expect(
      hasExcessPermissions({ contents: "read", metadata: "read" }),
    ).toBe(false);
  });

  it("flags write, admin, or extra permissions", () => {
    expect(hasExcessPermissions({ contents: "write" })).toBe(true);
    expect(hasExcessPermissions({ contents: "read", issues: "read" })).toBe(
      true,
    );
    expect(
      hasExcessPermissions({ contents: "read", administration: "write" }),
    ).toBe(true);
  });
});
